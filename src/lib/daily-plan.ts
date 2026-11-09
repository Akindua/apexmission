/**
 * AI day-plan builder.
 *
 * The deterministic local planner is always available (zero network cost) and
 * is used as the instant first pass and as the fallback whenever the AI
 * endpoint is unavailable. The authenticated `/api/day-plan` route refines the
 * proposal with the operator's configured model.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { authHeaders } from "@/lib/api-auth";
import {
  MAX_TASKS_PER_TIER,
  todayKey,
  type ImpactTier,
  type MissionState,
  type Task,
} from "@/lib/mission-store";

export interface DayPlanProposal {
  high: string[];
  medium: string[];
  low: string[];
  dailyAction: string;
  rationale: string;
  source: "local" | "ai";
}

export interface DayPlanInput {
  mission: string;
  tasks: Record<ImpactTier, Task[]>;
}

const MAX_PLAN_ITEMS = MAX_TASKS_PER_TIER;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function pendingTexts(tasks: Task[] | undefined): string[] {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => !task.done)
    .map((task) => clean(task.text))
    .filter(Boolean);
}

function cap(items: string[]): string[] {
  return unique(items).slice(0, MAX_PLAN_ITEMS);
}

/**
 * Zero-API planner: carries every unfinished priority forward in impact order
 * and promotes the highest-leverage item to the single daily focus action.
 */
export function buildLocalDayPlan(input: DayPlanInput): DayPlanProposal {
  const high = cap(pendingTexts(input.tasks.high));
  const medium = cap(pendingTexts(input.tasks.medium));
  const low = cap(pendingTexts(input.tasks.low));

  const mission = clean(input.mission);
  const dailyAction =
    high[0] ||
    medium[0] ||
    low[0] ||
    (mission ? `Advance the mission: ${mission}` : "Define today's highest-impact objective.");

  const total = high.length + medium.length + low.length;
  const rationale =
    total === 0
      ? "No unfinished priorities were found. Today's plan starts from a clean matrix and the declared mission."
      : `${total} unfinished priorit${total === 1 ? "y was" : "ies were"} rolled forward. High-impact work is queued first, with the daily focus anchored to "${dailyAction}".`;

  return { high, medium, low, dailyAction, rationale, source: "local" };
}

interface RawPlan {
  high?: unknown;
  medium?: unknown;
  low?: unknown;
  dailyAction?: unknown;
  rationale?: unknown;
}

function normalizeAiPlan(raw: unknown): DayPlanProposal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as RawPlan;

  const tier = (value: unknown): string[] =>
    cap(
      (Array.isArray(value) ? value : [])
        .map((entry) => clean(entry))
        .filter(Boolean),
    );

  const high = tier(candidate.high);
  const medium = tier(candidate.medium);
  const low = tier(candidate.low);
  const dailyAction = clean(candidate.dailyAction);

  if (high.length + medium.length + low.length === 0 && !dailyAction) return null;

  return {
    high,
    medium,
    low,
    dailyAction: dailyAction || high[0] || medium[0] || low[0] || "",
    rationale:
      clean(candidate.rationale) ||
      "AI prioritized the carried-over backlog by impact and execution order.",
    source: "ai",
  };
}

/**
 * Refines the deterministic plan with the authenticated AI endpoint. Throws on
 * any failure so the caller can silently retain the local plan.
 */
export async function requestAiDayPlan(input: DayPlanInput): Promise<DayPlanProposal> {
  const unfinished = {
    high: pendingTexts(input.tasks.high),
    medium: pendingTexts(input.tasks.medium),
    low: pendingTexts(input.tasks.low),
  };

  const response = await fetch("/api/day-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ mission: input.mission, unfinished }),
  });

  if (!response.ok) {
    throw new Error(`Day planner failed: ${response.status}`);
  }

  const plan = normalizeAiPlan(await response.json());
  if (!plan) throw new Error("Day planner returned an invalid plan.");
  return plan;
}

/**
 * Merges an AI-refined plan with the deterministic local plan without ever
 * losing operator work. The local matrix stays authoritative for content; the
 * AI only supplies ordering, the daily focus, and the rationale.
 */
export function mergeDayPlans(local: DayPlanProposal, refined: DayPlanProposal): DayPlanProposal {
  const reorder = (localItems: string[], aiItems: string[]): string[] => {
    const aiOrder = new Map(aiItems.map((item, index) => [item.toLowerCase(), index]));
    return [...localItems]
      .sort((a, b) => {
        const aIndex = aiOrder.get(a.toLowerCase());
        const bIndex = aiOrder.get(b.toLowerCase());
        if (aIndex === undefined && bIndex === undefined) return 0;
        if (aIndex === undefined) return 1;
        if (bIndex === undefined) return -1;
        return aIndex - bIndex;
      })
      .slice(0, MAX_PLAN_ITEMS);
  };

  return {
    high: reorder(local.high, refined.high),
    medium: reorder(local.medium, refined.medium),
    low: reorder(local.low, refined.low),
    dailyAction: refined.dailyAction || local.dailyAction,
    rationale: refined.rationale || local.rationale,
    source: "ai",
  };
}

function makeTask(text: string, tier: ImpactTier, index: number): Task {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `plan-${tier}-${crypto.randomUUID()}`
      : `plan-${tier}-${Date.now()}-${index}`;
  return { id, text, tier, done: false };
}

/** Replaces today's matrix with the accepted plan. */
export function applyDayPlan(state: MissionState, plan: DayPlanProposal): MissionState {
  const matrix = (items: string[], tier: ImpactTier): Task[] =>
    items
      .slice(0, MAX_TASKS_PER_TIER)
      .map((text, index) => makeTask(text, tier, index));

  const dailyText = clean(plan.dailyAction) || state.daily.text;

  return {
    ...state,
    tasks: {
      high: matrix(plan.high, "high"),
      medium: matrix(plan.medium, "medium"),
      low: matrix(plan.low, "low"),
    },
    daily: { text: dailyText, done: false, date: todayKey() },
    planDate: todayKey(),
  };
}
