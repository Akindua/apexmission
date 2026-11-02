import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";

export const Route = createFileRoute("/api/cron/send-4pm-push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Constant-time token verification
        const authHeader = request.headers.get("authorization") ?? "";
        const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const expected = process.env["CRON_SECRET"] ?? "";

        if (!expected) {
          console.error("[Cron] CRON_SECRET not configured");
          return new Response("Server misconfigured", { status: 500 });
        }

        if (!constantTimeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const vapidPrivateKey = process.env["VAPID_PRIVATE_KEY"];
        const vapidSubject = process.env["VAPID_SUBJECT"] ?? "mailto:admin@apexmissions.app";

        if (!supabaseUrl || !supabaseServiceKey || !vapidPrivateKey) {
          console.error("[Cron] Missing required env vars");
          return new Response("Server misconfigured", { status: 500 });
        }

        webpush.setVapidDetails(vapidSubject, vapidPrivateKey, "");

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const nowUtc = new Date();

        // Fetch all subscriptions that haven't been sent today (in their timezone)
        // We fetch all and filter in JS to handle timezone correctly
        const { data: subscriptions, error: fetchError } = await supabase
          .from("push_subscriptions")
          .select("user_id, endpoint, p256dh, auth, timezone, last_sent_date")
          .limit(500);

        if (fetchError) {
          console.error("[Cron] Fetch error");
          return new Response("Failed to fetch subscriptions", { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
          return Response.json({ sent: 0, skipped: 0, deleted: 0 });
        }

        // Filter: only personal accounts (no company_id in profiles)
        const userIds = subscriptions.map((s) => s.user_id);
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, company_id")
          .in("id", userIds);

        if (profileError) {
          console.error("[Cron] Profile fetch error");
          return new Response("Failed to fetch profiles", { status: 500 });
        }

        const personalUserIds = new Set(
          profiles?.filter((p) => p.company_id === null).map((p) => p.id) ?? []
        );

        let sent = 0;
        let skipped = 0;
        let deleted = 0;

        const pushPromises = subscriptions.map(async (sub) => {
          // Skip corporate accounts
          if (!personalUserIds.has(sub.user_id)) {
            skipped++;
            return;
          }

          // Check user's local time is between 16:30 and 16:59
          const userTz = sub.timezone || "UTC";
          const userTime = new Intl.DateTimeFormat("en-US", {
            timeZone: userTz,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(nowUtc);
          const match = userTime.match(/^(\d{2}):(\d{2})$/);
          if (!match) {
            skipped++;
            return;
          }
          const hour = parseInt(match[1]!, 10);
          const minute = parseInt(match[2]!, 10);

          const isInWindow = hour === 16 && minute >= 30 && minute <= 59;
          if (!isInWindow) {
            skipped++;
            return;
          }

          // Check if already sent today in user's timezone
          const userDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: userTz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(nowUtc);

          if (sub.last_sent_date === userDate) {
            skipped++;
            return;
          }

          // Check if user has unfinished high-impact tasks
          const hasUnfinishedHigh = await checkUnfinishedHighImpact(supabase, sub.user_id, userDate);
          if (!hasUnfinishedHigh) {
            skipped++;
            return;
          }

          // Send push
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                body: "Time to close your top task before 5 PM.",
                data: { url: "/app" },
              })
            );

            // Update last_sent_date
            const { error: updateError } = await supabase
              .from("push_subscriptions")
              .update({ last_sent_date: userDate })
              .eq("user_id", sub.user_id);

            if (updateError) {
              console.error("[Cron] Failed to update last_sent_date");
            } else {
              sent++;
            }
          } catch (pushError: any) {
            const statusCode = pushError?.statusCode ?? pushError?.status;
            if (statusCode === 404 || statusCode === 410) {
              const { error: delError } = await supabase
                .from("push_subscriptions")
                .delete()
                .eq("user_id", sub.user_id);
              if (delError) {
                console.error("[Cron] Failed to delete expired subscription");
              } else {
                deleted++;
              }
            } else {
              console.error("[Cron] Push failed");
            }
          }
        });

        await Promise.all(pushPromises);

        return Response.json({ sent, skipped, deleted });
      },
    },
  },
});

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Checks if a user has any unfinished high-impact tasks for the given date.
 * Uses the profiles.current_plan JSONB column.
 */
async function checkUnfinishedHighImpact(supabase: any, userId: string, userDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_plan, plan_date")
    .eq("id", userId)
    .single();

  if (error || !data) return false;

  // Only check if plan_date matches user's today
  if (data.plan_date !== userDate) return false;

  const plan = data.current_plan;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.high)) return false;

  // Check if any high-impact task is not done
  return plan.high.some((task: any) => task && typeof task === "object" && task.done !== true);
}