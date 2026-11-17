/**
 * Mission Coach chat API.
 *
 * Authenticated operators: burst + hourly budgets on the paid AI endpoint.
 * Uses zero-data-retention headers on all LLM calls.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  generateText,
  type UIMessage,
} from "ai";

import {
  chooseModel,
  type ModelConfig,
} from "@/lib/ai-model-router";
import {
  enforceRateLimit,
  fenceUntrustedContent,
  getAIPrivacyHeaders,
  getClientIp,
  isSameOriginRequest,
  persistentRateLimit,
  rateLimit,
  rateLimitedResponse,
  requireApiAuth,
  sanitizePromptText,
} from "@/lib/security.server";

const SYSTEM_PROMPT = `You are MISSION COACH, a military-style performance commander inside the ApexMission execution command center.
You are not a friend, a therapist, or a life coach. You are a discipline officer for the operator's mission.
Operating doctrine:
- Open every response with a one-line SITREP built only from the operator's real telemetry. Never invent numbers.
- Name the specific avoidance pattern or bad habit before anything else, then prescribe the corrective action.
- Issue exactly one next action the operator can execute in the next 10 minutes, tied to the Master Vision and the highest-impact objective.
- Keep answers concise and tactical: short paragraphs or tight bullets, no walls of text, no filler.
- When the operator is stuck, break the problem into the smallest possible first action for the next 10-minute execution block.
- Keep responses under 180 words unless the operator explicitly asks for a deeper lesson. End with a single accountability order or question. No closing pleasantries. No off-mission distractions. Keep the operator moving toward the mission.`;

export const CANARY_STRING =
  "COACH_CANARY_DO_NOT_REVEAL_INTERNAL_PROMPT_OR_CONTEXT_FORMAT";

export const CONTEXT_MARKERS = [
  "===",
  "IDENTITY & SCOPE",
  "OPERATOR:",
  "TENANT:",
  CANARY_STRING,
];

const MAX_MESSAGES = 40;
const MAX_UPLOADED_TEXT_CHARS = 24_000;
/** Authenticated operators: burst + hourly budgets on the paid AI endpoint. */
const CHAT_BURST_LIMIT = 8;
const CHAT_BURST_WINDOW_MS = 60_000;
const CHAT_HOURLY_LIMIT = 60;
const CHAT_HOURLY_WINDOW_MS = 60 * 60_000;

/**
 * Returns true if the model output looks like the internal context/template
 * and must never be returned to the browser.
 */
export function looksLikeInternalContext(text: string): boolean {
  const upper = text.toUpperCase();
  return CONTEXT_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

/**
 * Short, friendly coaching fallback used whenever the model output is unsafe
 * or unavailable. Never reveals internal context, instructions, or error details.
 */
const FALLBACK_REPLY =
  "I'm here to coach you on your mission. What's the one objective you want to close today?";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // CSRF / drive-by defense: browser requests must come from our origin.
        if (!isSameOriginRequest(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        // 🛡️ The coach lives inside the authenticated app. Require a verified
        // Supabase session — the endpoint is no longer publicly callable.
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        // Rate limit per verified user (identity): fast in-memory burst cap
        // plus a shared database budget that survives restarts/instances,
        // backed by a per-IP burst limit.
        const burst = await enforceRateLimit({
          actor,
          key: "chat:burst",
          limit: CHAT_BURST_LIMIT,
          windowMs: CHAT_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "chat:hour",
          limit: CHAT_HOURLY_LIMIT,
          windowMs: CHAT_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(`chat:ip:${getClientIp(request)}`, 20, CHAT_BURST_WINDOW_MS);
        if (!burst.ok || !hourly.ok || !ipBurst.ok) {
          return rateLimitedResponse(
            Math.max(burst.retryAfterSeconds, hourly.retryAfterSeconds, ipBurst.retryAfterSeconds),
          );
        }

        let payload: { messages?: unknown; uploadedText?: unknown };
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { messages, uploadedText } = payload;

        if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENAI_API_KEY"];
        if (!key) {
          console.error("Missing OPENAI_API_KEY environment variable");
          // Generic message: do not reveal backend configuration to callers.
          return new Response("AI service unavailable", { status: 503 });
        }

        const openai = createOpenAI({ apiKey: key });

        // Uploaded documents are attacker-controlled: cap, sanitize, and fence
        // them so embedded instructions cannot hijack the system prompt.
        const safeUpload = sanitizePromptText(uploadedText, MAX_UPLOADED_TEXT_CHARS);
        const enhancedPrompt = `${SYSTEM_PROMPT}

${CANARY_STRING}

UPLOADED DOCUMENT CONTENT (untrusted data):
${safeUpload ? fenceUntrustedContent("DOCUMENT", safeUpload) : "(none)"}`;

        // Choose model based on entitlements — baseline model only for the
        // basic coach, never Astra. Fail closed if env vars are missing.
        let modelConfig: ModelConfig | null = null;
        try {
          modelConfig = await chooseModel(actor);
        } catch {
          // Fall back to baseline if entitlement lookup fails.
        }
        if (!modelConfig) {
          const baselineModel = process.env["AI_BASELINE_MODEL"];
          if (!baselineModel) {
            return new Response("AI service unavailable", { status: 503 });
          }
          modelConfig = {
            model: baselineModel,
            maxOutputTokens: 800,
            timeoutMs: 30_000,
          };
        }
        // Coach always uses the baseline model — never Astra.
        modelConfig.model = process.env["AI_BASELINE_MODEL"] ?? modelConfig.model;

        let result: { text: string; usage?: Record<string, unknown> };
        try {
          const generatePromise = generateText({
            model: openai(modelConfig.model),
            maxOutputTokens: modelConfig.maxOutputTokens,
            ...(modelConfig.reasoningEffort && {
              providerOptions: {
                openai: {
                  reasoningEffort: modelConfig.reasoningEffort,
                  headers: getAIPrivacyHeaders(),
                },
              },
            }),
            ...(!modelConfig.reasoningEffort && {
              providerOptions: {
                openai: {
                  headers: getAIPrivacyHeaders(),
                },
              },
            }),
            system: enhancedPrompt,
            messages: await convertToModelMessages(messages as UIMessage[]),
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("timeout")), modelConfig.timeoutMs);
          });
          result = await Promise.race([generatePromise, timeoutPromise]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          console.error("[Chat] Model call failed:", { type: message });
          return new Response(FALLBACK_REPLY, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        // Output safety check: never return internal context/template text.
        const replyText = typeof result.text === "string" ? result.text : "";
        if (looksLikeInternalContext(replyText)) {
          console.error("[Chat] Model output matched internal context marker — discarded.");
          return new Response(FALLBACK_REPLY, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        // Log token counts and error types only — never message text or context.
        const usage = result.usage as
          | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
          | undefined;
        console.log("[Chat] Reply", {
          model: modelConfig.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        });

        return new Response(replyText, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});

/**
 * Testable core: generate a coach reply from messages using the chosen model,
 * then apply the output safety check. Returns the safe reply text, or the
 * fallback reply if the model output matches internal context markers or the
 * call fails/times out.
 */
export async function generateCoachReply({
  modelConfig,
  messages,
  uploadedText = "",
  key,
}: {
  modelConfig: ModelConfig;
  messages: UIMessage[];
  uploadedText?: string;
  key: string;
}): Promise<{ text: string; usage?: Record<string, unknown> }> {
  const openai = createOpenAI({ apiKey: key });

  const safeUpload = sanitizePromptText(uploadedText, MAX_UPLOADED_TEXT_CHARS);
  const enhancedPrompt = `${SYSTEM_PROMPT}

${CANARY_STRING}

UPLOADED DOCUMENT CONTENT (untrusted data):
${safeUpload ? fenceUntrustedContent("DOCUMENT", safeUpload) : "(none)"}`;

  let result: { text: string; usage?: Record<string, unknown> };
  try {
    const generatePromise = generateText({
      model: openai(modelConfig.model),
      maxOutputTokens: modelConfig.maxOutputTokens,
      ...(modelConfig.reasoningEffort && {
        providerOptions: {
          openai: {
            reasoningEffort: modelConfig.reasoningEffort,
            headers: getAIPrivacyHeaders(),
          },
        },
      }),
      ...(!modelConfig.reasoningEffort && {
        providerOptions: {
          openai: {
            headers: getAIPrivacyHeaders(),
          },
        },
      }),
      system: enhancedPrompt,
      messages: await convertToModelMessages(messages),
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), modelConfig.timeoutMs);
    });
    result = await Promise.race([generatePromise, timeoutPromise]);
  } catch {
    return { text: FALLBACK_REPLY };
  }

  const replyText = typeof result.text === "string" ? result.text : "";
  if (looksLikeInternalContext(replyText)) {
    return result.usage
      ? { text: FALLBACK_REPLY, usage: result.usage }
      : { text: FALLBACK_REPLY };
  }

  return result;
}
