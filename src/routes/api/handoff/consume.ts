import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/handoff/consume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        let body: { code?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code || code.length < 22) {
          return new Response("Invalid code", { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[HandoffConsume] Missing Supabase env vars");
          return new Response("Service unavailable", { status: 503 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: targetSlug, error } = await supabase.rpc("consume_handoff_code", {
          p_code: code,
        });

        if (error) {
          const msg = error.message ?? "Failed to consume handoff code";
          console.warn("[HandoffConsume] RPC error:", msg);
          return new Response(msg, { status: 400 });
        }

        if (!targetSlug) {
          return new Response("Invalid or expired handoff code", { status: 400 });
        }

        return Response.json({ targetSlug });
      },
    },
  },
});

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}