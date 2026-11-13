/**
 * Enterprise security middleware for ApexMission.
 *
 * Provides `requireEnterpriseTier()` — a middleware that verifies the caller
 * is an authenticated operator belonging to an enterprise tenant (i.e. their
 * `profiles.company_id` is non-null).
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { requireApiAuth } from "@/lib/security.server";

export interface EnterpriseActor {
  userId: string;
  token: string;
  companyId: string;
  role: string;
}

export async function requireRole(
  request: Request,
  requiredRole: string,
): Promise<EnterpriseActor | Response> {
  const actor = await requireApiAuth(request);
  if (actor instanceof Response) return actor;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabaseKey) {
    console.error("[Security] Missing Supabase env vars");
    return new Response("Service misconfigured", { status: 500 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${actor.token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", actor.userId)
    .single();

  if (error || !profile) {
    return new Response(
      JSON.stringify({ error: "profile_not_found", message: "Profile not found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  if (profile.role !== requiredRole) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: `Role ${requiredRole} required` }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );
  }

  return {
    userId: actor.userId,
    token: actor.token,
    companyId: profile.company_id ?? "",
    role: profile.role,
  };
}

export async function requireEnterpriseTier(request: Request): Promise<EnterpriseActor | Response> {
  const actor = await requireApiAuth(request);
  if (actor instanceof Response) return actor;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabaseKey) {
    console.error("[EnterpriseSecurity] Missing Supabase env vars");
    return new Response("Service misconfigured", { status: 500 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${actor.token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", actor.userId)
    .single();

  if (error || !profile || !profile.company_id) {
    return new Response(
      JSON.stringify({ error: "enterprise_required", message: "Enterprise tier required" }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );
  }

  return {
    userId: actor.userId,
    token: actor.token,
    companyId: profile.company_id ?? "",
    role: profile.role,
  };
}
