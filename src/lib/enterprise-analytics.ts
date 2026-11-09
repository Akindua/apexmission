/**
 * Company-scoped enterprise execution analytics (privacy-aligned).
 *
 * All reads go through SECURITY DEFINER RPCs that resolve the caller's company
 * from `auth.uid()`. A corporate operator can only ever receive rows for their
 * own tenant, and the global leaderboard is never queried here.
 *
 * PRIVACY PRINCIPLE: Managers see ONLY what employees explicitly logged:
 *   - completed tasks per person (with text, tier, date)
 *   - week-over-week completed count
 *   - carried-over tasks (from current_plan high tier)
 *   - blockers they entered (from current_plan high tier, not done)
 * NO credits, streaks, failure_count, velocity_score, operational_status,
 * FALLEN status, "streak leader", "at-risk operators", or gamification.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CompanyRoute {
  companyId: string;
  companyName: string;
  companySlug: string;
}

export interface EnterpriseTotals {
  completedToday: number;
  completed7d: number;
  completedPrev7d: number;
  highCompleted7d: number;
  activeOperators7d: number;
  carriedOverHigh: number;
  blockersCount: number;
}

export interface EnterpriseDailyTrend {
  date: string;
  completed: number;
  high: number;
}

export interface CompletedTask {
  date: string;
  text: string;
  tier: "high" | "medium" | "low";
  completedAt: string | null;
}

export interface EnterpriseOperator {
  id: string;
  name: string;
  completedTasks: CompletedTask[];
  carriedOverHigh: string[];
  blockers: string[];
}

export interface EnterpriseAnalytics {
  companyId: string;
  companyName: string;
  companySlug: string;
  generatedAt: string;
  windowDays: number;
  members: number;
  totals: EnterpriseTotals;
  trend: EnterpriseDailyTrend[];
  operators: EnterpriseOperator[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCompanyRoute(raw: unknown): CompanyRoute | null {
  const row = asRecord(raw);
  if (!row) return null;

  const companyId = asString(row["company_id"]);
  if (!companyId) return null;

  return {
    companyId,
    companyName: asString(row["company_name"], "Organization"),
    companySlug: asString(row["company_slug"]),
  };
}

/** Route for the signed-in operator's own company (null for personal accounts). */
export async function fetchMyCompanyRoute(): Promise<CompanyRoute | null> {
  const { data, error } = await supabase.rpc("get_my_company_route");
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return toCompanyRoute(row);
}

/** Public-branding route for an invite token, used to redirect to the tenant host. */
export async function resolveCompanyRouteByInviteToken(token: string): Promise<CompanyRoute | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc("get_company_route_by_invite_token", {
    p_token: trimmed,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return toCompanyRoute(row);
}

/** Parses the JSONB payload returned by `get_company_execution_analytics()`. */
export function parseEnterpriseAnalytics(raw: unknown): EnterpriseAnalytics | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const companyId = asString(obj["company_id"]);
  if (!companyId) return null;

  const totalsObj = asRecord(obj["totals"]) ?? {};

  const trend: EnterpriseDailyTrend[] = asArray(obj["trend"]).flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const date = asString(row["date"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [
      {
        date,
        completed: asNumber(row["completed"]),
        high: asNumber(row["high"]),
      },
    ];
  });

  const operators: EnterpriseOperator[] = asArray(obj["operators"]).flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const id = asString(row["id"]);
    if (!id) return [];

    const completedTasks: CompletedTask[] = asArray(row["completed_tasks"]).flatMap((task) => {
      const t = asRecord(task);
      if (!t) return [];
      const date = asString(t["date"]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
      const tier = asString(t["tier"]);
      if (!["high", "medium", "low"].includes(tier)) return [];
      return [
        {
          date,
          text: asString(t["text"]),
          tier: tier as "high" | "medium" | "low",
          completedAt: typeof t["completed_at"] === "string" ? t["completed_at"] : null,
        },
      ];
    });

    const carriedOverHigh: string[] = asArray(row["carried_over_high"]).map((t) => asString(t)).filter(Boolean);
    const blockers: string[] = asArray(row["blockers"]).map((t) => asString(t)).filter(Boolean);

    return [
      {
        id,
        name: asString(row["name"], "Operator"),
        completedTasks,
        carriedOverHigh,
        blockers,
      },
    ];
  });

  return {
    companyId,
    companyName: asString(obj["company_name"], "Organization"),
    companySlug: asString(obj["company_slug"]),
    generatedAt: asString(obj["generated_at"], new Date().toISOString()),
    windowDays: asNumber(obj["window_days"], 28),
    members: asNumber(obj["members"]),
    totals: {
      completedToday: asNumber(totalsObj["completed_today"]),
      completed7d: asNumber(totalsObj["completed_7d"]),
      completedPrev7d: asNumber(totalsObj["completed_prev_7d"]),
      highCompleted7d: asNumber(totalsObj["high_completed_7d"]),
      activeOperators7d: asNumber(totalsObj["active_operators_7d"]),
      carriedOverHigh: asNumber(totalsObj["carried_over_high"]),
      blockersCount: asNumber(totalsObj["blockers_count"]),
    },
    trend,
    operators,
  };
}

/** Fetches the caller's company analytics. Returns null for personal accounts. */
export async function fetchCompanyExecutionAnalytics(days = 28): Promise<EnterpriseAnalytics | null> {
  const { data, error } = await supabase.rpc("get_company_execution_analytics", {
    p_days: Math.max(7, Math.min(Math.trunc(days), 90)),
  });
  if (error) throw error;
  return parseEnterpriseAnalytics(data);
}

/** Short plain-language weekly brief for managers (privacy-aligned). */
export function buildWeeklySummary(analytics: EnterpriseAnalytics): string {
  const { totals, members, operators } = analytics;
  const delta = totals.completed7d - totals.completedPrev7d;
  const direction =
    delta > 0
      ? `up ${delta} from last week`
      : delta < 0
        ? `down ${Math.abs(delta)} from last week`
        : "level with last week";

  const sentences: string[] = [
    `The team closed ${totals.completed7d} priorit${totals.completed7d === 1 ? "y" : "ies"} this week, ${direction}.`,
  ];

  if (members > 0) {
    sentences.push(
      `${totals.activeOperators7d} of ${members} operator${members === 1 ? "" : "s"} logged at least one closure.`,
    );
  }

  // High-impact completed this week
  if (totals.highCompleted7d > 0) {
    sentences.push(
      `${totals.highCompleted7d} high-impact item${totals.highCompleted7d === 1 ? " was" : "s were"} completed.`,
    );
  }

  // Carried-over high-impact work
  if (totals.carriedOverHigh > 0) {
    sentences.push(
      `${totals.carriedOverHigh} high-impact item${totals.carriedOverHigh === 1 ? " is" : "s are"} carried over.`,
    );
  }

  // Blockers entered by team members
  if (totals.blockersCount > 0) {
    sentences.push(
      `${totals.blockersCount} blocker${totals.blockersCount === 1 ? " was" : "s were"} reported by the team.`,
    );
  }

  // Per-operator detail (optional, can be verbose for large teams)
  const operatorsWithWork = operators.filter(
    (op) => op.completedTasks.length > 0 || op.carriedOverHigh.length > 0 || op.blockers.length > 0,
  );
  if (operatorsWithWork.length > 0) {
    const details = operatorsWithWork
      .slice(0, 5) // Limit to first 5 to keep summary concise
      .map((op) => {
        const parts: string[] = [];
        if (op.completedTasks.length > 0) {
          parts.push(`${op.completedTasks.length} completed`);
        }
        if (op.carriedOverHigh.length > 0) {
          parts.push(`${op.carriedOverHigh.length} carried over`);
        }
        if (op.blockers.length > 0) {
          parts.push(`${op.blockers.length} blocker${op.blockers.length === 1 ? "" : "s"}`);
        }
        return `${op.name}: ${parts.join(", ")}`;
      })
      .join("; ");
    sentences.push(`Breakdown: ${details}${operatorsWithWork.length > 5 ? "…" : ""}.`);
  }

  return sentences.join(" ");
}