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

                const { mission } = body;

                    // #region agent log
                    fetch('http://127.0.0.1:7678/ingest/579042e6-c02b-4f8a-9ee7-63d6d222301a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a0f5c'},body:JSON.stringify({sessionId:'6a0f5c',runId:'pre-fix',hypothesisId:'B',location:'mission-plan.ts:POST',message:'mission-plan body',data:{keys:body&&typeof body==='object'?Object.keys(body):[],hasDocument:typeof document==='string'&&document.length>0,documentLen:typeof document==='string'?document.length:0,hasMission:typeof (body as {mission?:unknown}).mission==='string'},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion

                    if (!mission) {
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
    "mission": "",
    "high": [],
    "medium": [],
    "low": [],
    "dailyAction": ""
}

Make tasks actionable and specific.
No markdown.
No explanations.
`,
                        prompt: mission,
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