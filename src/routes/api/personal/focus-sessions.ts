import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/security.server";
import { enforceRateLimit } from "@/lib/security.server";

export const Route = createFileRoute("/api/personal/focus-sessions")({
  server: {
    handlers: {
      /**
       * POST: Start or update a focus session.
       * Body: { tier: "high"|"medium"|"low", minutes: number }
       */
      POST: async ({ request }) => {
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[FocusSession] Missing Supabase env vars");
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
          minutes?: number;
          done?: boolean;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const {
          text: task_text,
          tier = "high",
          minutes = 25,
          done = false,
        } = body as {
          text?: string;
          tier?: string;
          minutes?: number;
          done?: boolean;
        };

        if (!task_text) {
          return new Response("task_text is required", { status: 400 });
        }
        if (!minutes || minutes < 1 || minutes > 120) {
          return new Response("minutes must be between 1 and 120", { status: 400 });
        }

        const now = new Date().toISOString();

        const { data: session, error } = await supabase
          .from("personal_focus_sessions")
          .insert({
            user_id: actor.userId,
            task_text: task_text,
            tier: tier,
            minutes: minutes,
            done: done,
          })
          .select("id, user_id, task_text, tier, minutes, done, created_at, updated_at")
          .single();

        if (error || !session) {
          console.error("[FocusSession] Insert error:", error);
          return new Response("Failed to create focus session", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "created",
            session,
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },

      GET: async ({ request }) => {
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[FocusSessions] Missing Supabase env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const today = new Date().toISOString().split("T")[0];

        const { data: sessions, error } = await supabase
          .from("personal_focus_sessions")
          .select("id, user_id, task_text, tier, minutes, done, created_at, updated_at")
          .eq("user_id", actor.userId)
          .eq("created_at", today)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[FocusSessions] Query error:", error);
          return new Response("Failed to fetch sessions", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "success",
            sessions: sessions ?? [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
