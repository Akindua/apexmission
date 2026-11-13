import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/personal/daily-plan")({
  server: {
    handlers: {
      /**
       * GET: Get today's daily plan (anchor task) for the authenticated user.
       * Returns a 404 if no plan has been set yet today.
       */
      GET: async ({ request }) => {
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[DailyPlan] Missing Supabase env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const today = new Date().toISOString().split("T")[0];

        const { data: plan, error } = await supabase
          .from("personal_daily_plan")
          .select("id, user_id, task_text, tier, is_done, created_at, updated_at")
          .eq("user_id", actor.userId)
          .eq("created_at", today)
          .single();

        if (error) {
          const pgErr = error as { code?: string };
          if (pgErr.code === "PGRST116") {
            // No rows found - no plan set for today yet
            return new Response(
              JSON.stringify({
                status: "not_found",
                message: "No daily plan set for today.",
              }),
              { status: 404, headers: { "content-type": "application/json" } },
            );
          }
          console.error("[DailyPlan] Query error:", error);
          return new Response("Failed to fetch day plan", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "success",
            plan: plan,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },

      POST: async ({ request }) => {
        // 🛡️ Authenticated users only (personal accounts)
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[DailyPlan] Missing Supabase env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        let body: {
          task_text?: string;
          tier?: string;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const task_text = typeof body.task_text === "string" ? body.task_text.trim() : "";
        const tier = typeof body.tier === "string" ? body.tier.trim() : "high";

        if (!task_text) {
          return new Response("task_text is required", { status: 400 });
        }

        // Upsert: insert or update today's plan for this user
        const { data: plan, error } = await supabase
          .from("personal_daily_plan")
          .upsert(
            {
              user_id: actor.userId,
              task_text: task_text,
              tier: tier,
              is_done: false,
            },
            { onConflict: "user_id" },
          )
          .select("id, user_id, task_text, tier, is_done, created_at, updated_at")
          .single();

        if (error || !plan) {
          console.error("[DailyPlan] Insert error:", error);
          return new Response("Failed to create daily plan", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "created",
            plan: plan,
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
