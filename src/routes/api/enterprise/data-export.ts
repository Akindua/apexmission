import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";
import { requireEnterpriseTier } from "@/lib/security.enterprise";

export const Route = createFileRoute("/api/enterprise/data-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Enterprise tier only
        const actor = await requireEnterpriseTier(request);
        if (actor instanceof Response) return actor;

        // Rate limit: maximum 1 export request per 24 hours per user
        const rate = await enforceRateLimit({
          actor: { userId: actor.userId, token: actor.token },
          key: "enterprise-data-export:request",
          limit: 1,
          windowMs: 24 * 60 * 60 * 1000,
        });
        if (!rate.ok) {
          return new Response(
            JSON.stringify({
              error: "rate_limited",
              message: "Maximum 1 data export request per 24 hours.",
              retry_after_seconds: rate.retryAfterSeconds,
            }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "Retry-After": String(Math.max(1, rate.retryAfterSeconds)),
              },
            },
          );
        }

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

        // Create the export request record (status = pending)
        const { data: requestRow, error: insertError } = await supabase
          .from("data_export_requests")
          .insert({
            user_id: actor.userId,
            status: "pending",
            request_type: "enterprise_export",
          })
          .select("id, status, created_at")
          .single();

        if (insertError || !requestRow) {
          console.error("[ExportData] Insert error:", insertError);
          return new Response("Failed to create export request", { status: 500 });
        }

        // Return 202 Accepted — background worker will process
        return new Response(
          JSON.stringify({
            status: "processing",
            requestId: requestRow.id,
          }),
          {
            status: 202,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
