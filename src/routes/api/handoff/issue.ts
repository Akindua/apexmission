import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";

export const Route = createFileRoute("/api/handoff/issue")({
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
          key: "handoff:issue",
          limit: 10,
          windowMs: 60_000,
        });
        if (!rate.ok) {
          return rateLimitedResponse(rate.retryAfterSeconds);
        }

        let body: { targetSlug?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const targetSlug = typeof body.targetSlug === "string" ? body.targetSlug.trim().toLowerCase() : "";
        if (!targetSlug || (targetSlug !== "platform" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(targetSlug))) {
          return new Response("Invalid targetSlug", { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          console.error("[HandoffIssue] Missing Supabase env vars");
          return new Response("Service unavailable", { status: 503 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${actor.token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: code, error } = await supabase.rpc("issue_handoff_code", {
          p_target_slug: targetSlug,
        });

        if (error) {
          console.error("[HandoffIssue] RPC error:", error);
          return new Response("Failed to issue handoff code", { status: 500 });
        }

        return Response.json({ code });
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