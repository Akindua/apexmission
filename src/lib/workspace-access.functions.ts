import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WorkspaceAccessStatus {
  companyId: string;
  companyName: string;
  companySlug: string;
  isContractPaid: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
  /** True only when the license is unpaid AND the pilot ended over 14 days ago. */
  isPilotExpired: boolean;
}

/**
 * The backend can distinguish a personal account (no workspace) from a
 * transient database failure. Keeping that distinction lets the UI retry a
 * failed license check instead of falsely reporting that no workspace exists.
 */
export interface WorkspaceAccessResult {
  available: boolean;
  status: WorkspaceAccessStatus | null;
}

/**
 * Server-side enterprise license gate.
 *
 * The RPC is SECURITY DEFINER because `public.companies` is RLS-locked, and it
 * only returns the caller's own workspace. A missing row means the signed-in
 * account is personal (company_id IS NULL) and has no workspace to gate.
 *
 * Failures intentionally degrade to `available: false` so a transient database
 * error cannot lock every corporate operator out of the product. The guard
 * fails open and retries; dashboard data itself remains protected by RLS.
 */
export const getWorkspaceAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceAccessResult> => {
    const { data, error } = await context.supabase.rpc("get_workspace_access_status");

    if (error) {
      console.error("[Workspace] Access status lookup failed:", error);
      return { available: false, status: null };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { available: true, status: null };

    return {
      available: true,
      status: {
        companyId: row.company_id,
        companyName: row.company_name,
        companySlug: row.company_slug,
        isContractPaid: Boolean(row.is_contract_paid),
        trialStartedAt: row.trial_started_at,
        trialEndsAt: row.trial_ends_at,
        isPilotExpired: Boolean(row.is_pilot_expired),
      },
    };
  });
