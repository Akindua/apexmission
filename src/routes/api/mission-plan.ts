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
                    fetch('http://127.0.0.1:7678/ingest/579042e6-c02b-4f8a-9ee7-63d6d222301a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a0f5c'},body:JSON.stringify({sessionId:'6a0f5c',runId:'post-fix',hypothesisId:'B',location:'mission-plan.ts:POST',message:'mission-plan body',data:{keys:body&&typeof body==='object'?Object.keys(body):[],hasDocument:typeof (body as {document?:unknown}).document==='string'&&String((body as {document?:unknown}).document).length>0,documentLen:typeof (body as {document?:string}).document==='string'?(body as {document:string}).document.length:0,hasMission:typeof (body as {mission?:unknown}).mission==='string'},timestamp:Date.now()})}).catch(()=>{});
                // #endregion

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

                console.log("MISSION PLAN RAW:");
                console.log(result.text);
                
                try {
                    return Response.json(
                        JSON.parse(result.text)
                    );
                } catch (error) {
                    console.error("PARSE FAILED:");
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
