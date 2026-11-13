import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import { enforceRateLimit, getAIPrivacyHeaders, requireApiAuth } from "@/lib/security.server";
import { requireEnterpriseTier } from "@/lib/security.enterprise";

export const Route = createFileRoute("/api/enterprise/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Enterprise tier only
        const actor = await requireEnterpriseTier(request);
        if (actor instanceof Response) return actor;

        // Rate limit: maximum 10 transcription requests per hour per user
        const rate = await enforceRateLimit({
          actor,
          key: "enterprise-transcribe:request",
          limit: 10,
          windowMs: 24 * 60 * 60 * 1000,
        });
        if (!rate.ok) {
          return new Response(
            JSON.stringify({
              error: "rate_limited",
              message: "Maximum 10 transcript summaries per 24 hours.",
              retry_after_seconds: rate.retryAfterSeconds,
            }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "Retry-After": String(Math.max(1, rate.retryAfterSeconds)),
              },
            },
          );
        }

        let body: {
          transcript?: unknown;
          participantConsentGiven?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { transcript: rawTranscript, participantConsentGiven } = body;

        if (participantConsentGiven !== true) {
          return new Response(
            JSON.stringify({
              error: "consent_required",
              message: "Participant consent is required before transcribing audio.",
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }

        const transcript = typeof rawTranscript === "string" ? rawTranscript.trim() : "";

        if (!transcript) {
          return new Response("Transcript text is required", { status: 400 });
        }

        if (transcript.length > 50000) {
          return new Response("Transcript exceeds 50000 character limit", {
            status: 400,
          });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!supabaseUrl || !apiKey) {
          console.error("[Transcribe] Missing Supabase or OpenAI env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, apiKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const openai = createOpenAI({
          apiKey,
          baseURL: process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1",
        });

        try {
          const result = await generateText({
            model: openai("gpt-6-sol"),
            maxOutputTokens: 2000,
            ...(getAIPrivacyHeaders() && {
              providerOptions: {
                openai: { headers: getAIPrivacyHeaders() },
              },
            }),
            system: `You are an expert meeting summarizer. Summarize the following meeting transcript into:
1. A concise executive summary (2-4 sentences).
2. Key decisions made.
3. Action items with owners (if mentioned) and due dates (if mentioned).
4. Key discussion points/topics covered.

Output ONLY valid JSON with keys: summary, decisions, action_items, key_topics.
Do not include markdown fences or conversational text.`,
            messages: [{ role: "user", content: `Transcript:\n${transcript}` }],
          });

          return new Response(
            JSON.stringify({
              status: "completed",
              summary: result.text,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          console.error("[Transcribe] AI generation failed:", err);
          return new Response("Transcription summarization failed", { status: 500 });
        }
      },
    },
  },
});
