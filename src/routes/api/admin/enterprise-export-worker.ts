import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import JSZip from "jszip";
import { Resend } from "resend";

export const Route = createFileRoute("/api/admin/enterprise-export-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Worker endpoint — authenticated via SUPABASE_SERVICE_ROLE_KEY only.
        const authHeader = request.headers.get("authorization") ?? "";
        const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const expected = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

        if (!expected) {
          console.error("[ExportWorker] SUPABASE_SERVICE_ROLE_KEY not configured");
          return new Response("Service misconfigured", { status: 500 });
        }

        if (!provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const s3Bucket = process.env["S3_EXPORT_BUCKET"] ?? "";
        const s3Region = process.env["S3_REGION"] ?? "us-east-1";
        const s3AccessKey = process.env["S3_ACCESS_KEY_ID"] ?? "";
        const s3SecretKey = process.env["S3_SECRET_ACCESS_KEY"] ?? "";
        const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
        const resendFromEmail = process.env["RESEND_FROM_EMAIL"] ?? "noreply@apexmissions.app";

        if (
          !supabaseUrl ||
          !s3Bucket ||
          !s3AccessKey ||
          !s3SecretKey ||
          !supabaseServiceKey ||
          !resendApiKey
        ) {
          console.error("[ExportWorker] Missing S3/Supabase/Resend env vars");
          return new Response("Service misconfigured", { status: 500 });
        }

        const s3Client = new S3Client({
          region: s3Region,
          credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey },
        });

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const resend = new Resend(resendApiKey);

        // Fetch one pending export request (oldest first)
        const { data: requestRow, error: fetchError } = await supabase
          .from("data_export_requests")
          .select("id, user_id, status")
          .eq("status", "pending")
          .eq("request_type", "enterprise_export")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (fetchError || !requestRow) {
          // No pending requests — nothing to do
          return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
        }

        const requestId = requestRow.id;
        const userId = requestRow.user_id;

        // Mark as processing
        await supabase
          .from("data_export_requests")
          .update({ status: "processing" })
          .eq("id", requestId);

        try {
          // ── Step 2a: Gather all user data ───────────────────────────────
          const [profileResult, tasksResult, pushResult, exportHistoryResult] = await Promise.all([
            // User profile (display-safe columns only — no password hashes, salts, or internal credentials)
            supabase
              .from("profiles")
              .select(
                "id, email, full_name, company_id, onboarding_completed, current_plan, plan_date, task_history, created_at, updated_at",
              )
              .eq("id", userId)
              .single(),
            // Tasks owned by the user (enterprise tasks)
            supabase.from("tasks").select("*").eq("user_id", userId),
            // Push subscriptions (metadata only — no p256dh/auth secrets)
            supabase
              .from("push_subscriptions")
              .select("user_id, timezone, created_at, last_sent_date")
              .eq("user_id", userId),
            // Export requests history for this user
            supabase
              .from("data_export_requests")
              .select("id, status, request_type, created_at")
              .eq("user_id", userId),
          ]);

          const profile = profileResult.data ?? null;
          const tasks = tasksResult.data ?? [];
          const pushSubs = pushResult.data ?? [];
          const exportHistory = exportHistoryResult.data ?? [];

          // ── Step 2b: Build JSON payloads (no sensitive fields) ─────────
          const files = [
            {
              name: "user_profile.json",
              content: JSON.stringify(
                {
                  id: profile?.id,
                  email: profile?.email,
                  full_name: profile?.full_name,
                  company_id: profile?.company_id,
                  onboarding_completed: profile?.onboarding_completed,
                  current_plan: profile?.current_plan,
                  plan_date: profile?.plan_date,
                  created_at: profile?.created_at,
                  updated_at: profile?.updated_at,
                },
                null,
                2,
              ),
            },
            {
              name: "task_history.json",
              content: JSON.stringify(profile?.task_history ?? [], null, 2),
            },
            {
              name: "tasks.json",
              content: JSON.stringify(
                tasks.map((t) => ({
                  id: t.id,
                  company_id: t.company_id,
                  task_text: t.task_text,
                  impact_tier: t.impact_tier,
                  is_done: t.is_done,
                  created_at: t.created_at,
                  updated_at: t.updated_at,
                })),
                null,
                2,
              ),
            },
            {
              name: "push_subscriptions.json",
              content: JSON.stringify(
                pushSubs.map((s) => ({
                  timezone: s.timezone,
                  created_at: s.created_at,
                  last_sent_date: s.last_sent_date,
                })),
                null,
                2,
              ),
            },
            {
              name: "export_history.json",
              content: JSON.stringify(
                exportHistory.map((e) => ({
                  id: e.id,
                  status: e.status,
                  request_type: e.request_type,
                  created_at: e.created_at,
                })),
                null,
                2,
              ),
            },
            {
              name: "full_export.json",
              content: JSON.stringify(
                {
                  exported_at: new Date().toISOString(),
                  request_id: requestId,
                  user: {
                    id: profile?.id,
                    email: profile?.email,
                    full_name: profile?.full_name,
                    company_id: profile?.company_id,
                    onboarding_completed: profile?.onboarding_completed,
                    current_plan: profile?.current_plan,
                    plan_date: profile?.plan_date,
                    created_at: profile?.created_at,
                    updated_at: profile?.updated_at,
                  },
                  task_history: profile?.task_history ?? [],
                  tasks: tasks.map((t) => ({
                    id: t.id,
                    company_id: t.company_id,
                    task_text: t.task_text,
                    impact_tier: t.impact_tier,
                    is_done: t.is_done,
                    created_at: t.created_at,
                    updated_at: t.updated_at,
                  })),
                  push_subscriptions: pushSubs.map((s) => ({
                    timezone: s.timezone,
                    created_at: s.created_at,
                    last_sent_date: s.last_sent_date,
                  })),
                  export_history: exportHistory.map((e) => ({
                    id: e.id,
                    status: e.status,
                    request_type: e.request_type,
                    created_at: e.created_at,
                  })),
                },
                null,
                2,
              ),
            },
          ];

          // ── Step 3: Create ZIP archive ─────────────────────────────────
          const zip = new JSZip();
          for (const file of files) {
            zip.file(file.name, file.content);
          }

          const zipBlob = await zip.generateAsync({ type: "uint8array" });
          const zipBuffer = Buffer.from(zipBlob);

          const zipFileName = `data-export-${userId}-${requestId}.zip`;
          const s3Key = `exports/${userId}/${zipFileName}`;

          // Upload ZIP to S3
          await s3Client.send(
            new PutObjectCommand({
              Bucket: s3Bucket,
              Key: s3Key,
              Body: zipBuffer,
              ContentType: "application/zip",
            }),
          );

          // Generate presigned URL (24-hour expiry)
          const getObjectCommand = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key,
          });
          const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, {
            expiresIn: 24 * 60 * 60, // 24 hours
          });

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

          // ── Step 4: Mark as completed ─────────────────────────────────
          await supabase
            .from("data_export_requests")
            .update({
              status: "completed",
              file_url: presignedUrl,
              expires_at: expiresAt,
              processed_at: new Date().toISOString(),
            })
            .eq("id", requestId);

          // ── Step 4b: Send email notification (non-blocking) ─────────────────
          const userEmail = profile?.email;
          if (userEmail) {
            try {
              await resend.emails.send({
                from: resendFromEmail,
                to: userEmail,
                subject: "Your Enterprise Data Export is Ready",
                html: `
                  <!DOCTYPE html>
                  <html>
                    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                      <h2 style="color: #10b981; font-size: 24px; margin-bottom: 20px;">Your Enterprise Data Export is Ready</h2>
                      <p>Your enterprise data export has been completed successfully. You can download your data archive using the link below:</p>
                      <div style="background: #f3f4f6; border: 1px solid #e5e7e5; border-radius: 8px; padding: 16px; margin: 20px 0; word-break: break-all;">
                        <a href="${presignedUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">Download Your Enterprise Data Export</a>
                      </div>
                      <p><strong>Important:</strong> This download link expires in 24 hours (at ${new Date(expiresAt).toLocaleString()}). Please download your data before it expires.</p>
                      <p><strong>Security Notice:</strong> This link contains your personal and enterprise data. Do not share this link with anyone. If you did not request this export, please contact support immediately.</p>
                      <hr style="border: none; border-top: 1px solid #e5e7e5; margin: 30px 0;">
                      <p style="font-size: 12px; color: #6b7280;">
                        ApexMissions · Enterprise Data Export<br>
                        This email was sent to ${userEmail}. If you did not request this export, please contact support.
                      </p>
                    </body>
                  </html>
                `,
              });
            } catch (emailErr) {
              // Email failure should NOT fail the export — data is already saved
              console.error("[ExportWorker] Email send failed for request:", requestId, emailErr);
            }
          }

          return new Response(
            JSON.stringify({
              status: "completed",
              requestId,
              files: files.map((f) => f.name),
              download_url: presignedUrl,
              expires_at: expiresAt,
              emailSent: !!userEmail,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          console.error("[ExportWorker] Error processing request:", requestId, err);
          await supabase
            .from("data_export_requests")
            .update({
              status: "failed",
              error_message: err instanceof Error ? err.message : "Unknown error",
              processed_at: new Date().toISOString(),
            })
            .eq("id", requestId);

          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
