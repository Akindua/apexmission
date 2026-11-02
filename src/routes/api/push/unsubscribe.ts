import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/push/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        const rate = await enforceRateLimit({
          actor,
          key: "push:unsubscribe",
          limit: 5,
          windowMs: 60_000,
        });
        if (!rate.ok) {
          return rateLimitedResponse(rate.retryAfterSeconds);
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[PushUnsubscribe] Missing Supabase env vars");
          return new Response("Service unavailable", { status: 503 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        // Delete subscription (user_id comes from auth.uid() via RLS)
        const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", actor.userId);

        if (error) {
          console.error("[PushUnsubscribe] DB error:", error);
          return new Response("Failed to delete subscription", { status: 500 });
        }

        return new Response("OK", { status: 200 });
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

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "Retry-After": String(Math.max(1, retryAfterSeconds)),
    },
  });
}