import { createFileRoute } from "@tanstack/react-router";
import { requireEnterpriseTier } from "@/lib/security.enterprise";
import { requireRole } from "@/lib/security.enterprise";
import { enforceRateLimit } from "@/lib/security.server";

export const Route = createFileRoute("/api/enterprise/client-portal-documents")({
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
          console.error("[ClientDocuments] Missing Supabase env vars");
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
          file_url?: unknown;
          file_type?: unknown;
          file_size?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const title = typeof body.title === "string" ? body.title.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const file_url = typeof body.file_url === "string" ? body.file_url.trim() : "";
        const file_type = typeof body.file_type === "string" ? body.file_type.trim() : "";
        const file_size = typeof body.file_size === "number" ? body.file_size : 0;

        if (!title) {
          return new Response("title is required", { status: 400 });
        }
        if (!file_url) {
          return new Response("file_url is required", { status: 400 });
        }
        if (!file_type) {
          return new Response("file_type is required", { status: 400 });
        }

        const { data: document, error: insertError } = await supabase
          .from("client_portal_documents")
          .insert({
            user_id: actor.userId,
            company_id: actor.companyId,
            title,
            description,
            file_url,
            file_type,
            file_size,
          })
          .select(
            "id, user_id, company_id, title, description, file_url, file_type, file_size, created_at, updated_at",
          )
          .single();

        if (insertError || !document) {
          console.error("[EnterpriseDocuments] Insert error:", insertError);
          return new Response("Failed to create document", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "created",
            document,
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
