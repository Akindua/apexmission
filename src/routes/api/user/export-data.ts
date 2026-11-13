import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/user/export-data")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Authenticated users only
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        // Rate limit: maximum 1 export request per 24 hours per user
        const rate = await enforceRateLimit({
          actor,
          key: "data-export:request",
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
            request_type: "full_export",
          })
          .select("id, status, created_at")
          .single();

        if (insertError || !requestRow) {
          console.error("[ExportData] Insert error:", insertError);
          return new Response("Failed to create export request", { status: 500 });
        }

        // Enqueue background job for processing.
        // The background worker (Step 2) polls for status = 'pending' rows.
        // No work is done synchronously here — we immediately return 202.

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
