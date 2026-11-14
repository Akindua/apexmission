import { createFileRoute } from "@tanstack/react-router";
import { requireEnterpriseTier } from "@/lib/security.enterprise";
import { requireRole } from "@/lib/security.enterprise";
import { enforceRateLimit } from "@/lib/security.server";

export const Route = createFileRoute("/api/enterprise/client-portal-deliverables")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Enterprise tier required
        const actor = await requireEnterpriseTier(request);
        if (actor instanceof Response) return actor;

        // 🛡️ Client external role required
        const authorized = await requireRole(request, "client_external");
        if (authorized instanceof Response) return authorized;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[ExportData] Missing Supabase env vars");
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
            "id, user_id, company_id, title, description, status, due_date, created_at, updated_at",
          )
          .single();

        if (insertError || !deliverable) {
          console.error("[EnterpriseDeliverables] Insert error:", insertError);
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
    },
  },
});
