import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

export const Route = createFileRoute(
    "/api/mission-plan"
)({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const body = await request.json();

                const { mission } = body;

                if (!mission) {
                    return new Response(
                        "No document provided",
                        { status: 400 }
                    );
                }

                const openai = createOpenAI({
                    apiKey: process.env['OPENAI_API_KEY']!,
                });

                const result = await generateText({
                    model: openai("gpt-6-sol"),
                    // ✅ FIXED: Your custom high-performance prompt directive is now injected directly as the system layer instruction
                    system: `
You are an advanced, high-performance tactical optimization parser. Your absolute mandate is to ingest the attached raw document text parameters and decompose them into an immediate execution plan.

CRITICAL COMPLETION RULES:
1. You MUST generate at least 3 distinct actionable items for the HIGH, MEDIUM, and LOW impact tiers.
2. Do not omit the MEDIUM tier. If the document is dense, look for intermediate strategic steps and map them explicitly to the MEDIUM matrix array.
3. You MUST extract a singular, high-leverage "dailyAction" focus statement that can be completed within 2 hours to gain immediate execution velocity.
4. Output your response STRICTLY as a clean JSON object utilizing this exact structure:
   {
     "mission": "An overarching, ultra-clear 1-sentence vision directive synthesized from the file",
     "high": ["Task 1", "Task 2", "Task 3"],
     "medium": ["Task 1", "Task 2", "Task 3"],
     "low": ["Task 1", "Task 2", "Task 3"],
     "dailyAction": "The single highest leverage item to execute first today"
   }

Do not include markdown tags, conversational filler, or trailing commas. Output raw, valid, parseable JSON code only.
`,
                    prompt: mission,
                });

                try {
                    return Response.json(
                        JSON.parse(result.text)
                    );
                } catch {
                    return new Response(
                      "Mission Plan Parse Failed",
                      { status: 500 }
                    );
                }
            },
        },
    },
});
