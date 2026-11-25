/**
 * AI Chief of Staff Approval Token API — Creates short-lived approval tokens for
 * persistent modification commands that require explicit user confirmation.
 *
 * Security & privacy:
 *   - Authenticated only (requireApiAuth)
 *   - Tokens expire quickly (default 60 seconds)
 *   - Single-use tokens
 *   - Preview data stored for verification
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  enforceRateLimit,
  getClientIp,
  isSameOriginRequest,
  persistentRateLimit,
  rateLimit,
  rateLimitedResponse,
  requireApiAuth,
} from "@/lib/security.server";

const APPROVAL_BURST_LIMIT = 10;
const APPROVAL_BURST_WINDOW_MS = 60_000;
const APPROVAL_HOURLY_LIMIT = 60;
const APPROVAL_HOURLY_WINDOW_MS = 60 * 60_000;
const APPROVAL_TTL_SECONDS = 60;

export const Route = createFileRoute("/api/chief-of-staff/create-approval")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // CSRF / drive-by defense.
        if (!isSameOriginRequest(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        // Authenticated only.
        const actor = await requireApiAuth(request);
        if (actor instanceof Response) return actor;

        // Rate limits.
        const burst = await enforceRateLimit({
          actor,
          key: "chief-of-staff:approval:burst",
          limit: APPROVAL_BURST_LIMIT,
          windowMs: APPROVAL_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "chief-of-staff:approval:hour",
          limit: APPROVAL_HOURLY_LIMIT,
          windowMs: APPROVAL_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(
          `chief-of-staff:approval:ip:${getClientIp(request)}`,
          20,
          APPROVAL_BURST_WINDOW_MS,
        );
        if (!burst.ok || !hourly.ok || !ipBurst.ok) {
          return rateLimitedResponse(
            Math.max(burst.retryAfterSeconds, hourly.retryAfterSeconds, ipBurst.retryAfterSeconds),
          );
        }

        let payload: { command: string; preview: unknown };
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { command, preview } = payload;

        if (!command || typeof command !== "string") {
          return new Response("Command name is required", { status: 400 });
        }

        if (!preview || typeof preview !== "object") {
          return new Response("Preview data is required", { status: 400 });
        }

        // Generate secure random token
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + APPROVAL_TTL_SECONDS * 1000).toISOString();

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("[ChiefOfStaffApproval] Missing Supabase env vars");
          return new Response("Service unavailable", { status: 503 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { error } = await supabase.from("chief_of_staff_approvals").insert({
          user_id: actor.userId,
          command,
          token,
          preview,
          expires_at: expiresAt,
        });

        if (error) {
          console.error("[ChiefOfStaffApproval] Insert failed:", error);
          return new Response("Failed to create approval token", { status: 500 });
        }

        console.log("[ChiefOfStaffApproval] Token created", {
          command,
          userId: actor.userId,
          expiresAt,
        });

        return new Response(
          JSON.stringify({
            token,
            expires_at: expiresAt,
            ttl_seconds: APPROVAL_TTL_SECONDS,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      },
    },
  },
});
