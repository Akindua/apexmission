import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, requireApiAuth } from "@/lib/security.server";
import { requireEnterpriseTier } from "@/lib/security.enterprise";

export const Route = createFileRoute("/api/enterprise/time-entries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 🛡️ Enterprise tier required
        const actor = await requireEnterpriseTier(request);
        if (actor instanceof Response) return actor;

        // Rate limit: maximum 1 time-entry submission per 24 hours per user
        const rate = await enforceRateLimit({
          actor,
          key: "enterprise-time-entries:request",
          limit: 1,
          windowMs: 24 * 60 * 60 * 1000,
        });
        if (!rate.ok) {
          return new Response(
            JSON.stringify({
              error: "rate_limited",
              message: "Maximum 1 time-entry submission per 24 hours.",
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

        // Parse and validate request body
        let body: {
          project_id?: unknown;
          task_id?: unknown;
          hours_worked?: unknown;
          description?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
        const taskId = typeof body.task_id === "string" ? body.task_id.trim() : null;
        const hoursWorked = typeof body.hours_worked === "number" ? body.hours_worked : 0;
        const description = typeof body.description === "string" ? body.description.trim() : "";

        // Validation
        if (!projectId) {
          return new Response("project_id is required", { status: 400 });
        }
        if (!hoursWorked || hoursWorked <= 0 || hoursWorked > 24) {
          return new Response("hours_worked must be between 0 and 24", { status: 400 });
        }
        if (!description || description.length < 1 || description.length > 500) {
          return new Response("description must be between 1 and 500 characters", {
            status: 400,
          });
        }

        // Verify the task belongs to the caller's company (tenant isolation)
        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .select("id, company_id")
          .eq("id", taskId || "")
          .eq("company_id", actor.companyId)
          .single();

        if (taskError || !task) {
          return new Response("Task not found or not accessible within your company", {
            status: 404,
          });
        }

        // Verify the project_id matches the company (tenant isolation)
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("id")
          .eq("id", projectId)
          .eq("id", actor.companyId)
          .single();

        if (companyError || !company) {
          return new Response("Project not found or not accessible within your company", {
            status: 404,
          });
        }

        // Insert the time entry (RLS enforces company_id = actor.companyId)
        const { data: entry, error: insertError } = await supabase
          .from("time_entries")
          .insert({
            user_id: actor.userId,
            company_id: actor.companyId,
            project_id: projectId,
            task_id: taskId,
            hours_worked: hoursWorked,
            description,
          })
          .select(
            "id, user_id, company_id, project_id, task_id, hours_worked, description, created_at",
          )
          .single();

        if (insertError || !entry) {
          console.error("[ExportData] Insert error:", insertError);
          return new Response("Failed to create time entry", { status: 500 });
        }

        return new Response(
          JSON.stringify({
            status: "created",
            entry,
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
