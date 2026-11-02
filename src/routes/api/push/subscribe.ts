import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/push/subscribe")({
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
          key: "push:subscribe",
          limit: 5,
          windowMs: 60_000,
        });
        if (!rate.ok) {
          return rateLimitedResponse(rate.retryAfterSeconds);
        }

        let body: PushSubscriptionJSON | null = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
          return new Response("Invalid subscription: missing endpoint or keys", { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[PushSubscribe] Missing Supabase env vars");
          return new Response("Service unavailable", { status: 503 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        // Upsert subscription (user_id comes from auth.uid() via RLS)
        const { error } = await supabase.from("push_subscriptions").upsert({
          user_id: actor.userId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          timezone: body.timezone ?? "UTC",
        });

        if (error) {
          console.error("[PushSubscribe] DB error:", error);
          return new Response("Failed to save subscription", { status: 500 });
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

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  timezone?: string;
}