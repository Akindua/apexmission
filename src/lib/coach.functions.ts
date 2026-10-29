import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CoachInput {
  mission: string;
  note: string;
  tasks: Array<{ text: string; tier: string; done: boolean }>;
  velocityScore?: number | null;
}

/** Recommends the single next highest-impact action from today's progress note. */
export const recommendNextAction = createServerFn({ method: "POST" })
  // 🛡️ Authenticated operators only — this endpoint spends AI credits.
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CoachInput) => {
    if (typeof data?.note !== "string" || !data.note.trim()) {
      throw new Error("Write a short progress note first.");
    }
    return {
      mission: String(data.mission ?? "").slice(0, 500),
      note: data.note.slice(0, 2000),
      tasks: Array.isArray(data.tasks) ? data.tasks.slice(0, 30) : [],
      velocityScore: typeof data?.velocityScore === "number" ? data.velocityScore : null,
    };
  })
  .handler(async ({ data, context }) => {
    // Per-operator budget on the AI coach: fast in-memory window plus the
    // shared database limiter (survives restarts, spans instances).
    const { rateLimit } = await import("@/lib/security.server");
    const budget = rateLimit(`coach:${context.userId}`, 30, 60 * 60_000);
    let sharedOk = true;
    try {
      // The generated Database types predate the consume_rate_limit RPC, so
      // widen the call site instead of regenerating types mid-deploy.
      const rpc = context.supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>;
      const { data: allowed, error } = await rpc("consume_rate_limit", {
        p_key: `coach:hour:${context.userId}`,
        p_limit: 30,
        p_window_seconds: 3600,
      });
      if (!error) sharedOk = allowed === true;
    } catch {
      // RPC unavailable (migration not applied) — memory limit still applies.
    }
    if (!budget.ok || !sharedOk) {
      throw Object.assign(new Error("Coach is at capacity — retry in a few minutes."), {
        statusCode: 429,
      });
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const taskList =
      data.tasks.length > 0
        ? data.tasks
            .map((t) => `- [${t.done ? "done" : "open"}] (${t.tier} impact) ${t.text}`)
            .join("\n")
        : "(no tasks listed)";

    const result = streamText({
      model: lovable.responses("openai/gpt-6-sol"),
      system:
        "You are a sharp, concise execution coach. Given a mission, a task list, today's progress note, and the operator's persisted velocity consistency score, recommend exactly ONE next highest-impact action. If the velocity score is low, prioritize repairing execution discipline before launching new initiatives. Reply in at most 55 words: one bold-free sentence naming the action, then one short sentence on why it is the highest leverage right now. No lists, no preamble.",
      prompt: `Mission: ${data.mission || "(not set)"}

Tasks:
${taskList}

Today's progress note:
${data.note}

Operator velocity consistency score:
${data.velocityScore ?? "NO SCORE RECORDED"}`,
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
    return {
      recommendation: text || "No recommendation came back — try adding more detail to your note.",
    };
  });
