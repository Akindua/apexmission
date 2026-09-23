import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export interface CoachInput {
  mission: string;
  note: string;
  tasks: Array<{ text: string; tier: string; done: boolean }>;
}

/** Recommends the single next highest-impact action from today's progress note. */
export const recommendNextAction = createServerFn({ method: "POST" })
  .inputValidator((data: CoachInput) => {
    if (typeof data?.note !== "string" || !data.note.trim()) {
      throw new Error("Write a short progress note first.");
    }
    return {
      mission: String(data.mission ?? "").slice(0, 500),
      note: data.note.slice(0, 2000),
      tasks: Array.isArray(data.tasks) ? data.tasks.slice(0, 30) : [],
    };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const taskList =
      data.tasks.length > 0
        ? data.tasks.map((t) => `- [${t.done ? "done" : "open"}] (${t.tier} impact) ${t.text}`).join("\n")
        : "(no tasks listed)";

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      system:
        "You are a sharp, concise execution coach. Given a mission, a task list and today's progress note, recommend exactly ONE next highest-impact action. Reply in at most 55 words: one bold-free sentence naming the action, then one short sentence on why it is the highest leverage right now. No lists, no preamble.",
      prompt: `Mission: ${data.mission || "(not set)"}\n\nTasks:\n${taskList}\n\nToday's progress note:\n${data.note}`,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const text = (await result.text).trim();
    return { recommendation: text || "No recommendation came back — try adding more detail to your note." };
  });
