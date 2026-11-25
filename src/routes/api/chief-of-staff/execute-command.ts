/**
 * AI Chief of Staff Command Execution API — Executes authorized commands from the
 * realtime voice agent. All commands are validated, authorized, and logged.
 *
 * Security & privacy:
 *   - Authenticated only (requireApiAuth)
 *   - Standard features available to ALL authenticated users
 *   - Enterprise advanced features gated behind enterprise subscription
 *   - Zero-data-retention / zero-training headers on all LLM calls
 *   - Commands validated against registry
 *   - Persistent modifications require explicit approval token
 *   - Idempotency keys prevent duplicate execution
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  enforceRateLimit,
  getClientIp,
  isSameOriginRequest,
  persistentRateLimit,
  rateLimit,
  rateLimitedResponse,
  requireApiAuth,
  sanitizePromptText,
} from "@/lib/security.server";
import { fetchEntitlement } from "@/lib/ai-model-router";
import {
  getCommand,
  getCommandRegistry,
  type CommandExecutionContext,
  type ProposeTaskCreateInput,
  type ProposeTaskUpdateInput,
  type ProposeMissionUpdateInput,
} from "@/lib/chief-of-staff-commands";
import { createClient } from "@supabase/supabase-js";

const EXECUTE_BURST_LIMIT = 10;
const EXECUTE_BURST_WINDOW_MS = 60_000;
const EXECUTE_HOURLY_LIMIT = 60;
const EXECUTE_HOURLY_WINDOW_MS = 60 * 60_000;
const EXECUTE_DAILY_LIMIT = 100;
const EXECUTE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

interface ExecuteCommandRequest {
  command: string;
  input: unknown;
  approvalToken?: string; // For persistent modifications
  idempotencyKey?: string; // Prevent duplicate execution
}

interface ExecuteCommandResponse {
  success: boolean;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approvalPreview?: unknown;
}

export const Route = createFileRoute("/api/chief-of-staff/execute-command")({
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
          key: "chief-of-staff:execute:burst",
          limit: EXECUTE_BURST_LIMIT,
          windowMs: EXECUTE_BURST_WINDOW_MS,
        });
        const hourly = await enforceRateLimit({
          actor,
          key: "chief-of-staff:execute:hour",
          limit: EXECUTE_HOURLY_LIMIT,
          windowMs: EXECUTE_HOURLY_WINDOW_MS,
        });
        const ipBurst = rateLimit(
          `chief-of-staff:execute:ip:${getClientIp(request)}`,
          20,
          EXECUTE_BURST_WINDOW_MS,
        );
        const daily = await persistentRateLimit(
          actor,
          "chief-of-staff:execute:user:daily",
          EXECUTE_DAILY_LIMIT,
          EXECUTE_DAILY_WINDOW_SECONDS,
        );
        if (!burst.ok || !hourly.ok || !ipBurst.ok || (daily && !daily.ok)) {
          return rateLimitedResponse(
            Math.max(
              burst.retryAfterSeconds,
              hourly.retryAfterSeconds,
              ipBurst.retryAfterSeconds,
              daily?.retryAfterSeconds ?? 0,
            ),
          );
        }

        let payload: ExecuteCommandRequest;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const { command: commandName, input, approvalToken, idempotencyKey } = payload;

        if (!commandName || typeof commandName !== "string") {
          return new Response("Command name is required", { status: 400 });
        }

        // Look up command in registry
        const command = getCommand(commandName);
        if (!command) {
          return new Response(`Unknown command: ${commandName}`, { status: 400 });
        }

        // Validate input against schema
        const parseResult = command.inputSchema.safeParse(input);
        if (!parseResult.success) {
          return new Response(`Invalid input: ${parseResult.error.message}`, { status: 400 });
        }

        // Check enterprise requirement
        if (command.requiresEnterprise) {
          const entitlement = await fetchEntitlement({ userId: actor.userId, token: actor.token });
          const isEnterprise =
            entitlement?.plan === "company_core" && entitlement?.status === "active";
          if (!isEnterprise) {
            return new Response(
              "Enterprise AI Chief of Staff features require an active enterprise subscription.",
              {
                status: 403,
                headers: { "content-type": "text/plain; charset=utf-8" },
              },
            );
          }
        }

        // Get user's company context for authorization
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        let companyId: string | null = null;
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${actor.token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", actor.userId)
            .maybeSingle();
          companyId = (profile as { company_id: string | null } | null)?.company_id ?? null;
        }

        // Build mission context (reusing existing logic)
        const missionContext = await buildMissionContext(actor.userId, actor.token, companyId);

        const execContext: CommandExecutionContext = {
          userId: actor.userId,
          token: actor.token,
          isEnterprise: Boolean(companyId),
          companyId,
          missionContext,
        };

        // Check idempotency for persistent modifications
        if (command.category === "persistent-modification" && idempotencyKey) {
          const idempotencyResult = await checkIdempotency(actor.userId, idempotencyKey);
          if (idempotencyResult) {
            return new Response(
              JSON.stringify({ success: true, output: idempotencyResult, idempotent: true }),
              { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
            );
          }
        }

        // For persistent modifications, require approval token
        if (command.category === "persistent-modification") {
          if (!approvalToken) {
            // Return preview for user approval
            const preview = await command.handler(parseResult.data, execContext);
            return new Response(
              JSON.stringify({
                success: false,
                requiresApproval: true,
                approvalPreview: preview,
              }),
              { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
            );
          }

          // Validate approval token (in a real implementation, this would be a signed token)
          const approvalValid = await validateApprovalToken(
            actor.userId,
            commandName,
            approvalToken,
          );
          if (!approvalValid) {
            return new Response("Invalid or expired approval token", { status: 403 });
          }
        }

        // Execute the command
        try {
          const output = await command.handler(parseResult.data, execContext);

          // Store idempotency result
          if (command.category === "persistent-modification" && idempotencyKey) {
            await storeIdempotencyResult(actor.userId, idempotencyKey, output);
          }

          // Validate output against schema
          const outputValidation = command.outputSchema.safeParse(output);
          if (!outputValidation.success) {
            console.error(
              "[ChiefOfStaffExecute] Output validation failed:",
              outputValidation.error,
            );
          }

          const response: ExecuteCommandResponse = {
            success: true,
            output,
          };

          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          console.error("[ChiefOfStaffExecute] Command execution failed:", error);
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Command execution failed",
            }),
            { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
          );
        }
      },
    },
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function buildMissionContext(
  userId: string,
  token: string,
  companyId: string | null,
): Promise<{
  firstName: string;
  mission: string | null;
  highTasks: Array<{ id: string; text: string; done: boolean }>;
  mediumTasks: Array<{ id: string; text: string; done: boolean }>;
  lowTasks: Array<{ id: string; text: string; done: boolean }>;
  dailyAction: string | null;
  dailyDone: boolean;
  streakCount: number;
}> {
  // In a real implementation, this would fetch from the database
  // For now, return a minimal context - the client should provide full context
  // This is a fallback for server-side command execution
  return {
    firstName: "Operator",
    mission: null,
    highTasks: [],
    mediumTasks: [],
    lowTasks: [],
    dailyAction: null,
    dailyDone: false,
    streakCount: 0,
  };
}

async function checkIdempotency(userId: string, key: string): Promise<unknown | null> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) return null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await supabase
    .from("chief_of_staff_idempotency")
    .select("result")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();

  return (data as { result: unknown } | null)?.result ?? null;
}

async function storeIdempotencyResult(userId: string, key: string, result: unknown): Promise<void> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await supabase.from("chief_of_staff_idempotency").upsert({
    user_id: userId,
    key,
    result,
    created_at: new Date().toISOString(),
  });
}

async function validateApprovalToken(
  userId: string,
  commandName: string,
  approvalToken: string,
): Promise<boolean> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseServiceKey) return false;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await supabase
    .from("chief_of_staff_approvals")
    .select("id")
    .eq("user_id", userId)
    .eq("command", commandName)
    .eq("token", approvalToken)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (data) {
    // Mark as used
    await supabase
      .from("chief_of_staff_approvals")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", (data as { id: string }).id);
    return true;
  }

  return false;
}
