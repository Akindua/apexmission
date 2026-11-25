/**
 * AI Chief of Staff Suggest API — Proactive AI suggestions.
 *
 * Generates proactive nudges, workflow recommendations, and scheduling
 * suggestions for the signed-in user. The AI operates strictly as a
 * suggestive copilot: every suggestion requires explicit user approval
 * before any change is made to user data or system state.
 *
 * Security & privacy:
 *   - Authenticated only (requireApiAuth)
 *   - Standard features available to ALL authenticated users
 *   - Enterprise advanced features gated behind enterprise subscription
 *   - Zero-data-retention / zero-training headers on LLM calls
 *   - Prompts sanitized and fenced; no PII in prompts or responses
 *   - Rate limited per user and per IP
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, type UIMessage } from "ai";

import { chooseModel, type ModelConfig, fetchEntitlement } from "@/lib/ai-model-router";
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

const SYSTEM_PROMPT = `You are the AI Chief of Staff, a suggestive personal AI copilot inside ApexMission.

CORE PRINCIPLE — HUMAN-IN-THE-LOOP:
You are strictly a suggestive copilot. You generate proactive nudges, workflow
recommendations, and scheduling suggestions. You NEVER make autonomous changes
to user data or system state. Every suggestion you make requires the user's
explicit tap/click to apply. Never phrase suggestions as commands or executed
actions — always as recommendations for the user to consider.

OUTPUT FORMAT:
Return a JSON object with this exact shape:
{
  "suggestions": [
    {
      "type": "nudge" | "workflow" | "schedule",
      "title": "Short title (max 6 words)",
      "body": "One or two sentences describing the suggestion",
      "rationale": "Why this matters for the user's mission (one sentence)",
      "suggestedAction": "Human-readable description of what applying does",
      "appliesTo": "task" | "schedule" | "focus" | "routine",
      "confidence": 0-100
    }
  ]
}

Rules:
- Generate 1-3 suggestions maximum.
- Each suggestion must be short, actionable, and tied to the user's mission,
  tasks, or streak.
- Never include PII (email, tenant IDs, UUIDs, account IDs, rank) in output.
- Never suggest irreversible actions.
- Keep titles under 6 words.
- Keep body under 40 words.
- Confidence is a display-only hint (0-100), never used to auto-apply.
- Tone: professional, encouraging, concise. Military-precise but not harsh.
- End each suggestion with an implicit question or invitation, not a command.
`;

const MAX_MESSAGES = 20;
const MAX_CONTEXT_CHARS = 3_000;
/** Per-user burst + hourly budgets on the suggest endpoint. */
const SUGGEST_BURST_LIMIT = 5;
const SUGGEST_BURST_WINDOW_MS = 60_000;
const SUGGEST_HOURLY_LIMIT = 30;
const SUGGEST_HOURLY_WINDOW_MS = 60 * 60_000;
/** Per-user daily cap for suggestions (DB-backed). */
const SUGGEST_DAILY_LIMIT = 20;
const SUGGEST_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

interface ChiefOfStaffContext {
  firstName: string;
  mission: string | null;
  highTasks: Array<{ id: string; text: string; done: boolean }>;
  mediumTasks: Array<{ id: string; text: string; done: boolean }>;
  lowTasks: Array<{ id: string; text: string; done: boolean }>;
  dailyAction: string | null;
  dailyDone: boolean;
  streakCount: number;
  /** If true, request enterprise-grade suggestions (requires enterprise subscription) */
  enterprise?: boolean;
}

export const Route = createFileRoute("/api/chief-of-staff/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // CSRF / drive-by defense.
        if (!isSameOriginRequest(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        // Authenticated only.
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        // Rate limits (standard tier).
        const burst = await enforceRateLimit({
          actor,
          key: "chief-of-staff:burst",
          limit: SUGGEST_BURST_LIMIT,
          windowMs: SUGGEST_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "chief-of-staff:hour",
          limit: SUGGEST_HOURLY_LIMIT,
          windowMs: SUGGEST_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(`chief-of-staff:ip:${getClientIp(request)}`, 10, SUGGEST_BURST_WINDOW_MS);
        const daily = await persistentRateLimit(
          actor,
          "chief-of-staff:user:daily",
          SUGGEST_DAILY_LIMIT,
          SUGGEST_DAILY_WINDOW_SECONDS,
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

        let payload: { context?: unknown; enterprise?: boolean };
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { context, enterprise } = payload;
        if (!context || typeof context !== "object") {
          return new Response("Context is required", { status: 400 });
        }

        // Enterprise features gate: check enterprise subscription
        if (enterprise) {
          const entitlement = await fetchEntitlement({ userId: actor.userId, token: actor.token });
          const isEnterprise = entitlement?.plan === "company_core" && entitlement?.status === "active";
          if (!isEnterprise) {
            return new Response("Enterprise AI Chief of Staff features require an active enterprise subscription.", {
              status: 403,
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
        }

        // Build a minimal, privacy-safe prompt from the context.
        // No PII (email, tenant IDs, UUIDs, rank, tier) is included.
        const ctx = context as Partial<ChiefOfStaffContext>;
        const safeContext = {
          firstName: sanitizePromptText(ctx.firstName, 50),
          mission: sanitizePromptText(ctx.mission ?? "", 200),
          highTaskCount: (ctx.highTasks ?? []).length,
          highTaskTitles: (ctx.highTasks ?? [])
            .map((t) => sanitizePromptText(t.text, 80))
            .slice(0, 5),
          mediumTaskCount: (ctx.mediumTasks ?? []).length,
          lowTaskCount: (ctx.lowTasks ?? []).length,
          dailyAction: sanitizePromptText(ctx.dailyAction ?? "", 200),
          dailyDone: Boolean(ctx.dailyDone),
          streakCount: Math.max(0, Number(ctx.streakCount) || 0),
        };

        const contextText = [
          `First name: ${safeContext.firstName}`,
          `Mission: ${safeContext.mission || "Not declared"}`,
          `High-impact tasks (${safeContext.highTaskCount}): ${safeContext.highTaskTitles.join("; ") || "none"}`,
          `Medium tasks: ${safeContext.mediumTaskCount}`,
          `Low tasks: ${safeContext.lowTaskCount}`,
          `Today's action: ${safeContext.dailyAction || "none"}`,
          `Today's action done: ${safeContext.dailyDone}`,
          `Streak: ${safeContext.streakCount} days`,
        ].join("\n");

        const key = process.env["OPENAI_API_KEY"];
        if (!key) {
          console.error("[ChiefOfStaff] Missing OPENAI_API_KEY environment variable");
          return new Response("AI service unavailable", { status: 503 });
        }

        const openai = createOpenAI({ apiKey: key });

        // Choose model — baseline model only, never Astra for Chief of Staff.
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
        // Chief of Staff always uses the baseline model — never Astra.
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
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages([
              {
                role: "user",
                content: `Operator context:\n${contextText}`,
              } as unknown as UIMessage,
            ]),
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("timeout")), modelConfig.timeoutMs);
          });
          result = await Promise.race([generatePromise, timeoutPromise]);
        } catch {
          console.error("[ChiefOfStaff] AI generation failed");
          return new Response(
            JSON.stringify({ suggestions: [] }),
            {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
                ...getAIPrivacyHeaders(),
              },
            },
          );
        }

        const replyText = typeof result.text === "string" ? result.text : String(result.text ?? "");

        // Parse the JSON response from the model.
        let suggestions: any[] = [];
        try {
          const parsed = JSON.parse(replyText);
          if (Array.isArray(parsed?.suggestions)) {
            suggestions = parsed.suggestions;
          }
        } catch {
          // If the model didn't return valid JSON, try to extract a JSON block.
          const jsonMatch = replyText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed?.suggestions)) {
                suggestions = parsed.suggestions;
              }
            } catch {
              suggestions = [];
            }
          }
        }

        // Sanitize and validate each suggestion before returning.
        const cleanSuggestions = suggestions
          .filter(
            (s) =>
              s &&
              typeof s.title === "string" &&
              typeof s.body === "string" &&
              typeof s.suggestedAction === "string",
          )
          .map((s) => ({
            type:
              s.type === "nudge" || s.type === "workflow" || s.type === "schedule"
                ? s.type
                : "nudge",
            title: sanitizePromptText(s.title, 60),
            body: sanitizePromptText(s.body, 200),
            rationale: sanitizePromptText(s.rationale || "", 200),
            suggestedAction: sanitizePromptText(s.suggestedAction, 120),
            appliesTo:
              s.appliesTo === "task" ||
              s.appliesTo === "schedule" ||
              s.appliesTo === "focus" ||
              s.appliesTo === "routine"
                ? s.appliesTo
                : "focus",
            confidence: Math.max(0, Math.min(100, Number(s.confidence) || 70)),
          }))
          .slice(0, 3);

        // Log token counts only — never message text or context.
        const usage = result.usage as
          { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
        console.log("[ChiefOfStaff] Suggestions generated", {
          model: modelConfig.model,
          count: cleanSuggestions.length,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        });

        return new Response(JSON.stringify({ suggestions: cleanSuggestions }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...getAIPrivacyHeaders(),
          },
        });
      },
    },
  },
});