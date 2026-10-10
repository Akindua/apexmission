import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

export const Route = createFileRoute("/api/pdf-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { document } =
          await request.json();

        if (!document) {
          return new Response(
            "No document provided",
            { status: 400 }
          );
        }

        const openai = createOpenAI({
          apiKey: process.env.OPENAI_API_KEY!,
        });

        const result = await generateText({
          model: openai("gpt-6-astra"),

          system: `
You are ApexMission Planner.

Analyze the uploaded document.

Return ONLY valid JSON:

{
  "mission": "",
  "high": [],
  "medium": [],
  "low": [],
  "dailyAction": ""
}

Create a mission based on the document.
Make tasks actionable and specific.
No markdown.
No explanations.
`,

          prompt: document,
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