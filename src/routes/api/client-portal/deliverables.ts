import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/security.enterprise";
import { enforceRateLimit } from "@/lib/security.server";

export const Route = createFileRoute("/api/client-portal/deliverables")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Client external role required
        const actor = await requireRole(request, "client_external");
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[ClientDeliverables] Missing Supabase env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        let body: {
          title?: unknown;
          description?: unknown;
          status?: unknown;
          due_date?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const title = typeof body.title === "string" ? body.title.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const status = typeof body.status === "string" ? body.status.trim() : "pending";
        const dueDate = typeof body.due_date === "string" ? body.due_date : null;

        if (!title) {
          return new Response("title is required", { status: 400 });
        }

        const { data: deliverable, error: insertError } = await supabase
          .from("client_portal_deliverables")
          .insert({
            user_id: actor.userId,
            company_id: actor.companyId,
            title,
            description,
            status,
            due_date: dueDate,
          })
          .select(
            "id, company_id, user_id, title, description, status, due_date, created_at, updated_at",
          )
          .single();

        if (insertError || !deliverable) {
          console.error("[ClientDeliverables] Insert error:", insertError);
          return new Response("Failed to create deliverable", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "created",
            deliverable,
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },

      // GET: List deliverables scoped to the caller's company only.
      // Explicitly excludes internal employee notes, task comments marked
      // internal_only, and employee time logs — those live in separate tables
      // and are never selected here.
      GET: async ({ request }) => {
        // 🛡️ Client external role required
        const actor = await requireRole(request, "client_external");
        if (actor instanceof Response) return actor;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[ClientDeliverables] Missing Supabase env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: deliverables, error } = await supabase
          .from("client_portal_deliverables")
          .select(
            "id, company_id, user_id, title, description, status, due_date, created_at, updated_at",
          )
          .eq("company_id", actor.companyId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[ClientDeliverables] Query error:", error);
          return new Response("Failed to fetch deliverables", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "success",
            deliverables: deliverables ?? [],
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
