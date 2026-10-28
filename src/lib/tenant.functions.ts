import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTenantSlug, SUBDOMAIN_HEADER } from "@/lib/tenant-host";

export interface SessionTenant {
  companyId: string;
  companyName: string;
  companySlug: string;
  /** True only when the signed-in operator's profile.company_id matches. */
  isMember: boolean;
}

/**
 * Resolves the wildcard-subdomain tenant for the active session.
 *
 * The slug is read from the server-injected `x-subdomain-slug` header (see
 * `src/server.ts`), then matched inside Postgres against
 * `public.companies.slug` and the caller's `profiles.company_id`. The browser
 * never supplies the slug, and the RPC is the only path that reads the
 * otherwise RLS-locked companies registry.
 */
export const resolveActiveTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionTenant | null> => {
    const slug = normalizeTenantSlug(getRequestHeader(SUBDOMAIN_HEADER));
    if (!slug) return null;

    const { data, error } = await context.supabase.rpc("resolve_session_tenant", {
      p_subdomain: slug,
    });

    if (error) {
      // The migration may not be applied yet; degrade to "no tenant context"
      // instead of blocking the whole dashboard.
      console.error("[Tenant] Subdomain resolution failed:", error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      companyId: row.company_id,
      companyName: row.company_name,
      companySlug: row.company_slug,
      isMember: Boolean(row.is_member),
    };
  });
