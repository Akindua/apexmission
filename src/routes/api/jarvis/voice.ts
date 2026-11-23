/**
 * Jarvis Voice API — Press-to-speak Jarvis suggestions.
 *
 * Accepts a recorded audio blob (WebM/Opus from MediaRecorder) plus the
 * operator's current mission/task context. Transcribes the audio via the
 * OpenAI Whisper API, then generates Jarvis suggestions from the transcript
 * combined with context.
 *
 * Security & privacy:
 *   - Authenticated only (requireApiAuth)
 *   - Standard features available to ALL authenticated users (personal & enterprise)
 *   - Enterprise advanced features gated behind enterprise subscription
 *   - Zero-data-retention / zero-training headers on all LLM calls
 *   - Audio is transcribed and immediately discarded — never stored by
 *     ApexMission
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

const SYSTEM_PROMPT = `You are JARVIS, a suggestive personal AI copilot inside ApexMission.

CORE PRINCIPLE — HUMAN-IN-THE-LOOP:
You are strictly a suggestive copilot. You generate proactive nudges, workflow
recommendations, and scheduling suggestions based on what the operator just
said. You NEVER make autonomous changes to user data or system state. Every
suggestion you make requires the user's explicit tap/click to apply. Never
phrase suggestions as commands or executed actions — always as recommendations
for the user to consider.

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
- Generate 1-3 suggestions maximum, tied to the operator's spoken request
  and their current mission/task context.
- Each suggestion must be short, actionable, and reference what was said.
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
/** Per-user burst + hourly budgets on the Jarvis voice endpoint. */
const JARVIS_VOICE_BURST_LIMIT = 5;
const JARVIS_VOICE_BURST_WINDOW_MS = 60_000;
const JARVIS_VOICE_HOURLY_LIMIT = 30;
const JARVIS_VOICE_HOURLY_WINDOW_MS = 60 * 60_000;
/** Per-user daily cap for Jarvis voice requests (DB-backed). */
const JARVIS_VOICE_DAILY_LIMIT = 20;
const JARVIS_VOICE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;
/** Max audio file size: 5 MB. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

interface JarvisContext {
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

export const Route = createFileRoute("/api/jarvis/voice")({
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
          key: "jarvis:voice:burst",
          limit: JARVIS_VOICE_BURST_LIMIT,
          windowMs: JARVIS_VOICE_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "jarvis:voice:hour",
          limit: JARVIS_VOICE_HOURLY_LIMIT,
          windowMs: JARVIS_VOICE_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(
          `jarvis:voice:ip:${getClientIp(request)}`,
          10,
          JARVIS_VOICE_BURST_WINDOW_MS,
        );
        const daily = await persistentRateLimit(
          actor,
          "jarvis:voice:user:daily",
          JARVIS_VOICE_DAILY_LIMIT,
          JARVIS_VOICE_DAILY_WINDOW_SECONDS,
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

        // Parse multipart form data: audio blob + context JSON.
        const formData = await request.formData();
        const audioFile = formData.get("audio") as File | null;
        const contextRaw = formData.get("context") as string | null;

        if (!audioFile) {
          return new Response("Audio file is required", { status: 400 });
        }

        if (audioFile.size > MAX_AUDIO_BYTES) {
          return new Response("Audio file too large (max 5 MB)", {
            status: 400,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        let context: Partial<JarvisContext> | null = null;
        let enterprise = false;
        if (contextRaw) {
          try {
            const parsed = JSON.parse(contextRaw);
            context = parsed;
            enterprise = Boolean(parsed.enterprise);
          } catch {
            return new Response("Invalid context JSON", { status: 400 });
          }
        }

        // Enterprise features gate: check enterprise subscription
        if (enterprise) {
          const entitlement = await fetchEntitlement({ userId: actor.userId, token: actor.token });
          const isEnterprise = entitlement?.plan === "company_core" && entitlement?.status === "active";
          if (!isEnterprise) {
            return new Response("Enterprise Jarvis features require an active enterprise subscription.", {
              status: 403,
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
        }

        const openaiKey = process.env["OPENAI_API_KEY"];
        if (!openaiKey) {
          console.error("[JarvisVoice] Missing OPENAI_API_KEY environment variable");
          return new Response("AI service unavailable", { status: 503 });
        }

        const openai = createOpenAI({ apiKey: openaiKey });

        // Step 1: Transcribe audio with Whisper.
        let transcript: string;
        try {
          const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
            },
            body: (() => {
              const fd = new FormData();
              fd.append("file", audioFile);
              fd.append("model", "whisper-1");
              fd.append("language", "en");
              return fd;
            })(),
          });

          if (!whisperResp.ok) {
            const errText = await whisperResp.text().catch(() => "");
            console.error("[JarvisVoice] Whisper transcription failed:", errText);
            return new Response("Transcription failed", { status: 502 });
          }

          const whisperData = await whisperResp.json();
          transcript = typeof whisperData.text === "string" ? whisperData.text : "";
        } catch (error) {
          console.error("[JarvisVoice] Whisper request error:", error);
          return new Response("Transcription service unavailable", { status: 502 });
        }

        if (!transcript || transcript.trim().length === 0) {
          return new Response("No speech detected", { status: 400 });
        }

        // Step 2: Generate suggestions from transcript + context.
        const safeContext = {
          firstName: sanitizePromptText(context?.firstName, 50),
          mission: sanitizePromptText(context?.mission ?? "", 200),
          highTaskCount: (context?.highTasks ?? []).length,
          highTaskTitles: (context?.highTasks ?? [])
            .map((t) => sanitizePromptText(t.text, 80))
            .slice(0, 5),
          mediumTaskCount: (context?.mediumTasks ?? []).length,
          lowTaskCount: (context?.lowTasks ?? []).length,
          dailyAction: sanitizePromptText(context?.dailyAction ?? "", 200),
          dailyDone: Boolean(context?.dailyDone),
          streakCount: Math.max(0, Number(context?.streakCount) || 0),
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
          ``,
          `Operator said: "${sanitizePromptText(transcript, 500)}"`,
        ].join("\n");

        // Choose model — baseline model only, never Astra for Jarvis voice.
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
        modelConfig.model = process.env["AI_BASELINE_MODEL"] ?? modelConfig.model;

        const enhancedPrompt = `${SYSTEM_PROMPT}

Operator context:
${contextText}`;

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
          system: enhancedPrompt,
          messages: await convertToModelMessages([
            {
              role: "user",
              content: `Transcript: "${transcript}"`,
            } as unknown as UIMessage,
          ]),
        });

        const replyText = typeof result.text === "string" ? result.text : String(result.text ?? "");

        // Parse the JSON response from the model.
        let suggestions: any[] = [];
        try {
          const parsed = JSON.parse(replyText);
          if (Array.isArray(parsed?.suggestions)) {
            suggestions = parsed.suggestions;
          }
        } catch {
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
        console.log("[JarvisVoice] Suggestions generated", {
          model: modelConfig.model,
          transcriptLength: transcript.length,
          count: cleanSuggestions.length,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        });

        return new Response(
          JSON.stringify({
            transcript,
            suggestions: cleanSuggestions,
          }),
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