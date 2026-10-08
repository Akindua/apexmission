import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `You are "My Mission Coach", a warm but sharp personal coach inside a goal-execution dashboard called ApexMission.
You help with anything: school subjects and studying, exam prep, career moves, personal organisation, habits, procrastination, focus and life advice.
Style: concise and practical. Lead with the answer or the next concrete step. Use short paragraphs or tight bullet lists, never walls of text.
When someone is stuck, break the problem into the smallest possible first action they could do in the next 10 minutes.
Teach subjects properly when asked — explain clearly with a worked example, then check understanding with one question.`;

const MISSION_PLANNER_PROMPT = `
You are ApexMission Planner.

Given a mission, return ONLY JSON:

{
  "high": ["task1","task2","task3"],
  "medium": ["task1","task2"],
  "low": ["task1","task2"],
  "dailyAction": "single action"
}

Tasks must be actionable.
Do not explain anything.
Do not include markdown.
`;

const PDF_ACTION_PLAN_PROMPT = `
You are ApexMission Planner.

Analyze the uploaded document.

Return ONLY JSON.

{
  "summary": "",
  "high": [],
  "medium": [],
  "low": [],
  "dailyAction": ""
}

Rules:

- High tasks should have the greatest impact.
- Medium tasks should be useful but less urgent.
- Low tasks should be minor preparation work.
- dailyAction must be the single most important thing to do today.
`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          messages,
          uploadedText,
        } = (await request.json()) as {
          messages?: unknown;
          uploadedText?: string;
        };
          
        console.log("SERVER uploadedText:", uploadedText);

        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENAI_API_KEY"];

        if (!key) {
          console.error("Missing OPENAI_API_KEY environment variable");
          return new Response("Missing OPENAI_API_KEY", { status: 500 });
        }

        const openai = createOpenAI({
          apiKey: key,
        });

        const enhancedPrompt = `
        ${SYSTEM_PROMPT}

        UPLOADED DOCUMENT CONTENT:
 
        ${uploadedText ?? "None"}
        `;

        const ip =
          request.headers.get("x-forwarded-for") ??
          "unknown";
 
        const usageStore =
          (globalThis as any).aiUsage ?? {};
 
        const count = Number(
          usageStore[ip] ?? 0
        );

        if (count >= 20) {
          return new Response(
            "Beta AI limit reached.",
            { status: 429 }
          );
        }

        (globalThis as any).aiUsage =
          usageStore;

        usageStore[ip] = count + 1;

        const result = streamText({
          model: openai("gpt-6-astra"),
          system: enhancedPrompt,
          messages: await convertToModelMessages(
          messages as UIMessage[],
          ),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});