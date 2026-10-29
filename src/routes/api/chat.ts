import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import {
  fenceUntrustedContent,
  getClientIp,
  isSameOriginRequest,
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

const MAX_MESSAGES = 40;
const MAX_UPLOADED_TEXT_CHARS = 24_000;
/** Authenticated operators: burst + hourly budgets on the paid AI endpoint. */
const CHAT_BURST_LIMIT = 8;
const CHAT_BURST_WINDOW_MS = 60_000;
const CHAT_HOURLY_LIMIT = 60;
const CHAT_HOURLY_WINDOW_MS = 60 * 60_000;

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

        // Rate limit per verified user (identity), backed by a per-IP burst cap.
        const burst = rateLimit(
          `chat:burst:${actor.userId}`,
          CHAT_BURST_LIMIT,
          CHAT_BURST_WINDOW_MS,
        );
        const hourly = rateLimit(
          `chat:hour:${actor.userId}`,
          CHAT_HOURLY_LIMIT,
          CHAT_HOURLY_WINDOW_MS,
        );
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

UPLOADED DOCUMENT CONTENT (untrusted data):
${safeUpload ? fenceUntrustedContent("DOCUMENT", safeUpload) : "(none)"}`;

        const result = streamText({
          model: openai("gpt-6-sol"),
          system: enhancedPrompt,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
