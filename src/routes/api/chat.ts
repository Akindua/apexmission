/**
 * Mission Coach chat API.
 *
 * Authenticated operators: burst + hourly budgets on the paid AI endpoint.
 * Uses zero-data-retention headers on all LLM calls.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, type UIMessage } from "ai";

import { chooseModel, type ModelConfig } from "@/lib/ai-model-router";
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

export const CANARY_STRING = "COACH_CANARY_DO_NOT_REVEAL_INTERNAL_PROMPT_OR_CONTEXT_FORMAT";

export const CONTEXT_MARKERS = ["===", "IDENTITY & SCOPE", "OPERATOR:", "TENANT:", CANARY_STRING];

const MAX_MESSAGES = 40;
const MAX_UPLOADED_TEXT_CHARS = 24_000;
/** Per-user daily cap for coach messages. */
const COACH_DAILY_LIMIT = 50;
const COACH_DAILY_WINDOW_SECONDS = 24 * 60 * 60;
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

const SYSTEM_PROMPT = `You are MISSION COACH, a military-style performance commander inside the ApexMission execution command center.
You are not a friend, a therapist, or a life coach. You are a discipline officer for the operator's mission.

OPERATING DOCTRINE
- Use the operator telemetry attached to the user message. Cite exact numbers. Never invent metrics, tasks, ranks, or history. If a field is missing, say "telemetry unavailable."
- Respect scope: in CORPORATE OPERATOR track, never mention public leaderboard, rank, or other operators.
- Open every response with a one-line SITREP built only from real telemetry.
- Name the specific avoidance pattern or bad habit before anything else, then prescribe the corrective action.
- Issue exactly one next action the operator can execute in the next 10 minutes, tied to the Master Vision and the highest-impact objective.
- Keep answers concise and tactical: short paragraphs or tight bullets, no walls of text, no filler. Under 180 words unless the operator explicitly asks for a deeper lesson, document analysis, or plan.
- End with a single accountability order or question. No closing pleasantries.

BAD HABITS TO CATCH
- Avoidance: high-impact work pending while low-value tasks get attention.
- Priority inversion: urgent-but-irrelevant work replacing mission-critical work.
- Planning loops: more strategy, setup, or documents instead of execution.
- Streak decay, missed daily actions, and missing morning/night reflection logs.
- Vanity metrics: checking rank, credits, themes, or leaderboard before executing.
- Task hoarding: adding objectives faster than closing them.
- Distraction: any request that does not serve the Master Vision.

ANTI-DISTRACTION RULE
If the request is off-mission, say so in one line and return to the next objective. Never dress distraction up as strategy. Keep the operator moving toward the mission.

TEACHING
When the operator explicitly asks to learn a subject or skill, teach it clearly with one worked example, then tie it back to the mission and check understanding with one question.`;

/**
 * Short, disciplined fallback used whenever the model output is unsafe or
 * unavailable. Never reveals internal context, instructions, or error details.
 */
const FALLBACK_REPLY =
  "SITREP: coaching link degraded. Return to the highest-impact objective and execute the next 10-minute block. What is the one task you are avoiding?";

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
        // Per-user daily cap (DB-backed).
        const daily = await persistentRateLimit(
          actor,
          "chat:user:daily",
          COACH_DAILY_LIMIT,
          COACH_DAILY_WINDOW_SECONDS,
        );
        if (!burst.ok || !hourly.ok || !ipBurst.ok || (daily && !daily.ok)) {
          return rateLimitedResponse(
            Math.max(
              burst.retryAfterSeconds,
              hourly.retryAfterSeconds,
              ipBurst.retryAfterSeconds,
              daily?.retryAfterSeconds ?? 0,
            ),
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

        // Choose model based on entitlements — baseline model only for the
        // basic coach, never Astra. Fail closed if env vars are missing.
        const modelConfig = await chooseModel(actor);
        if (!modelConfig) {
          console.error("[Chat] Model selection failed closed — AI unavailable.");
          return new Response("Coaching temporarily unavailable.", { status: 503 });
        }
        modelConfig.model = process.env["AI_BASELINE_MODEL"] ?? modelConfig.model;

        const key = process.env["OPENAI_API_KEY"];
        if (!key) {
          console.error("[Chat] Missing OPENAI_API_KEY environment variable");
          return new Response("Coaching temporarily unavailable.", { status: 503 });
        }

        const reply = await generateCoachReply({
          modelConfig,
          messages: messages as UIMessage[],
          uploadedText: typeof uploadedText === "string" ? uploadedText : "",
          key,
        });

        // Log token counts and error types only — never message text or context.
        const usage = reply.usage as
          { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
        console.log("[Chat] Reply", {
          model: modelConfig.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        });

        return new Response(reply.text, {
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
    return result.usage ? { text: FALLBACK_REPLY, usage: result.usage } : { text: FALLBACK_REPLY };
  }

  return result;
}
