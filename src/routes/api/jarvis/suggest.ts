/**
 * Jarvis Suggest API — Personal AI Assistant suggestions.
 *
 * Generates proactive nudges, workflow recommendations, and scheduling
 * suggestions for the signed-in user. Jarvis operates strictly as a
 * suggestive copilot: every suggestion requires explicit user approval
 * before any change is made to user data or system state.
 *
 * Security & privacy:
 *   - Authenticated only (requireApiAuth)
 *   - Subscription-gated (premium_active or lifetime)
 *   - Zero-data-retention / zero-training headers on LLM calls
 *   - Prompts sanitized and fenced; no PII in prompts or responses
 *   - Rate limited per user and per IP
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, type UIMessage } from "ai";

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

const SYSTEM_PROMPT = `You are JARVIS, a suggestive personal AI copilot inside ApexMission.

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
/** Per-user burst + hourly budgets on the Jarvis suggest endpoint. */
const JARVIS_BURST_LIMIT = 5;
const JARVIS_BURST_WINDOW_MS = 60_000;
const JARVIS_HOURLY_LIMIT = 30;
const JARVIS_HOURLY_WINDOW_MS = 60 * 60_000;
/** Per-user daily cap for Jarvis suggestions (DB-backed). */
const JARVIS_DAILY_LIMIT = 20;
const JARVIS_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

interface JarvisContext {
  firstName: string;
  mission: string | null;
  highTasks: Array<{ id: string; text: string; done: boolean }>;
  mediumTasks: Array<{ id: string; text: string; done: boolean }>;
  lowTasks: Array<{ id: string; text: string; done: boolean }>;
  dailyAction: string | null;
  dailyDone: boolean;
  streakCount: number;
}

export const Route = createFileRoute("/api/jarvis/suggest")({
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

        // Subscription gate: Jarvis is premium-only.
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[Jarvis] Missing Supabase env vars.");
          return new Response("Service unavailable", { status: 503 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", actor.userId)
          .maybeSingle();

        const tier =
          (profile?.subscription_tier as
            | "free"
            | "premium_active"
            | "lifetime") ?? "free";
        if (tier !== "premium_active" && tier !== "lifetime") {
          return new Response("Jarvis requires an active subscription.", {
            status: 403,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        // Rate limits.
        const burst = await enforceRateLimit({
          actor,
          key: "jarvis:burst",
          limit: JARVIS_BURST_LIMIT,
          windowMs: JARVIS_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "jarvis:hour",
          limit: JARVIS_HOURLY_LIMIT,
          windowMs: JARVIS_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(
          `jarvis:ip:${getClientIp(request)}`,
          10,
          JARVIS_BURST_WINDOW_MS,
        );
        const daily = await persistentRateLimit(
          actor,
          "jarvis:user:daily",
          JARVIS_DAILY_LIMIT,
          JARVIS_DAILY_WINDOW_SECONDS,
        );
        if (
          !burst.ok ||
          !hourly.ok ||
          !ipBurst.ok ||
          (daily && !daily.ok)
        ) {
          return rateLimitedResponse(
            Math.max(
              burst.retryAfterSeconds,
              hourly.retryAfterSeconds,
              ipBurst.retryAfterSeconds,
              daily?.retryAfterSeconds ?? 0,
            ),
          );
        }

        let payload: { context?: unknown };
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { context } = payload;
        if (!context || typeof context !== "object") {
          return new Response("Context is required", { status: 400 });
        }

        // Build a minimal, privacy-safe prompt from the context.
        // No PII (email, tenant IDs, UUIDs, rank, tier) is included.
        const ctx = context as Partial<JarvisContext>;
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
          console.error("[Jarvis] Missing OPENAI_API_KEY environment variable");
          return new Response("AI service unavailable", { status: 503 });
        }

        const openai = createOpenAI({ apiKey: key });

        // Choose model — baseline model only, never Astra for Jarvis.
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
        // Jarvis always uses the baseline model — never Astra.
        modelConfig.model = process.env["AI_BASELINE_MODEL"] ?? modelConfig.model;

        const result = await generateText({
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

        const replyText =
          typeof result.text === "string" ? result.text : String(result.text ?? "");

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
            confidence: Math.max(
              0,
              Math.min(100, Number(s.confidence) || 70),
            ),
          }))
          .slice(0, 3);

        // Log token counts only — never message text or context.
        const usage = result.usage as
          | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
          | undefined;
        console.log("[Jarvis] Suggestions generated", {
          model: modelConfig.model,
          count: cleanSuggestions.length,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        });

        return new Response(
          JSON.stringify({ suggestions: cleanSuggestions }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              ...getAIPrivacyHeaders(),
            },
          },
        );
      },
    },
  },
});
