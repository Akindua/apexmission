/**
 * Public showcase dataset for `demo.apexmissions.app`.
 *
 * Served by the pitch-demo team grid. Reads ONLY the seeded demo tenant
 * (slug strictly 'demo') through the service-role client, so nothing is ever
 * exposed via anonymous REST — the data leaves the database exclusively as
 * server-rendered HTML. Returns null when the seed row is missing so the
 * route can render a clear "not seeded" message instead of failing open.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */
import { createServerFn } from "@tanstack/react-start";

export const DEMO_SLUG = "demo";

export interface DemoOperator {
  id: string;
  name: string;
  credits: number;
  streak: number;
  status: string;
  completedToday: number;
}

export interface DemoTask {
  id: string;
  text: string;
  tier: "high" | "medium" | "low";
  completedAt: string;
}

export interface DemoShowcase {
  companyName: string;
  inviteCode: string;
  slug: string;
  operators: DemoOperator[];
  tasks: DemoTask[];
  loadedAt: string;
}

/** Public, read-only, demo-tenant-only projection. Safe for anonymous SSR. */
export const getDemoShowcase = createServerFn({ method: "GET" }).handler(
  async (): Promise<DemoShowcase | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 🔒 Strict tenant validation: exactly one row, slug must be 'demo'.
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, invite_token, slug")
      .eq("slug", DEMO_SLUG)
      .maybeSingle();

    if (companyError || !company || company.slug !== DEMO_SLUG) {
      console.error("[Demo] Demo tenant row missing or invalid:", companyError ?? company);
      return null;
    }

    const { data: taskRows } = await supabaseAdmin
      .from("tasks")
      .select("id, task_text, impact_tier, user_id, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true })
      .limit(100);

    const tasks: DemoTask[] = (taskRows ?? []).map((task) => ({
      id: task.id,
      text: task.task_text,
      tier: (task.impact_tier === "high" || task.impact_tier === "medium"
        ? task.impact_tier
        : "low") as DemoTask["tier"],
      completedAt: task.created_at,
    }));

    const operatorIds = [...new Set((taskRows ?? []).map((task) => task.user_id))];
    const { data: profileRows } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, credits, current_streak, operational_status")
      .in("id", operatorIds);

    const completedByOperator = new Map<string, number>();
    for (const task of taskRows ?? []) {
      completedByOperator.set(task.user_id, (completedByOperator.get(task.user_id) ?? 0) + 1);
    }

    const operators: DemoOperator[] = (profileRows ?? [])
      .map((profile) => ({
        id: profile.id,
        name: profile.full_name?.trim() || "Operator",
        credits: profile.credits ?? 0,
        streak: profile.current_streak ?? 0,
        status: profile.operational_status ?? "OPERATIONAL",
        completedToday: completedByOperator.get(profile.id) ?? 0,
      }))
      .sort((a, b) => b.credits - a.credits);

    return {
      companyName: company.name,
      inviteCode: company.invite_token,
      slug: company.slug,
      operators,
      tasks,
      loadedAt: new Date().toISOString(),
    };
  },
);
