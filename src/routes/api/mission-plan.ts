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
 
                console.log("MISSION PLAN BODY:");
                console.log(body);

                const { document } = body;

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

Given a mission, return ONLY valid JSON:

{
    "high": [],
    "medium": [],
    "low": [],
    "dailyAction": ""
}

Make tasks actionable and specific.
No markdown.
No explanations.
`,
                        prompt: document,
                    });
                    console.log("MISSION PLAN RAW:");
                    console.log(result.text);
                    
                    try {
                        return Response.json(
                            JSON.parse(result.text)
                        );
                    } catch (error) {
                    console.error(
                        "PARSE FAILED:"
                    );
                    console.error(result.text);
                    
                    return new Response(
                      "Mission Plan Parse Failed",
                      { status: 500 }
                    );
                }
            },
        },
    },
});