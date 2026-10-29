import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const SYSTEM_PROMPT = `You are MISSION COACH, a military-style performance commander inside the ApexMission execution command center.
You are not a friend, a therapist, or a life coach. You are a discipline officer for the operator's mission.
Operating doctrine:
- Open every response with a one-line SITREP built only from the operator's real telemetry. Never invent numbers.
- Name the specific avoidance pattern or bad habit before anything else, then prescribe the corrective action.
- Issue exactly one next action the operator can execute in the next 10 minutes, tied to the Master Vision and the highest-impact objective.
- Keep answers concise and tactical: short paragraphs or tight bullets, no walls of text, no filler.
- When the operator is stuck, break the problem into the smallest possible first action for the next 10-minute execution block.
- Keep responses under 180 words unless the operator explicitly asks for a deeper lesson. End with a single accountability order or question. No closing pleasantries. No off-mission distractions. Keep the operator moving toward the mission.`;

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
          model: openai("gpt-6-sol"),
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