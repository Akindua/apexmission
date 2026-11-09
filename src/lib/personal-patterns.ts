/**
 * Personal execution patterns.
 *
 * Everything here is derived from the operator's OWN logged task closures
 * (`profiles.task_history`) plus the current local matrix. No team or
 * leaderboard data is read, so a corporate operator never sees cross-tenant
 * intelligence in this card.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import type { ImpactTier, Task } from "@/lib/mission-store";
import { todayKey } from "@/lib/mission-store";

export interface TaskHistoryEntryLike {
  date: string;
  text?: string;
  tier?: ImpactTier;
  /** ISO timestamp captured when the task was closed. */
  completedAt?: string;
}

export type PatternTone = "emerald" | "amber" | "sky";

export interface PersonalPattern {
  id: string;
  title: string;
  detail: string;
  tone: PatternTone;
}

const DAY_MS = 86_400_000;

function startOfLocalDay(offsetDays = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetDays);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function countWithin(entries: TaskHistoryEntryLike[], fromOffset: number, toOffset: number): number {
  const from = localDateKey(startOfLocalDay(fromOffset));
  const to = localDateKey(startOfLocalDay(toOffset));
  return entries.filter((entry) => entry.date >= from && entry.date <= to).length;
}

function getCompletionHour(entry: TaskHistoryEntryLike): number | null {
  if (typeof entry.completedAt !== "string" || !entry.completedAt.includes("T")) return null;
  const parsed = new Date(entry.completedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours();
}

function bucketForHour(hour: number): "before noon" | "in the afternoon" | "in the evening" {
  if (hour < 12) return "before noon";
  if (hour < 17) return "in the afternoon";
  return "in the evening";
}

function normalizeHistory(raw: TaskHistoryEntryLike[] | undefined): TaskHistoryEntryLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry) =>
      entry &&
      typeof entry.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
      (entry.tier === undefined || entry.tier === "high" || entry.tier === "medium" || entry.tier === "low"),
  );
}

function countByTier(entries: TaskHistoryEntryLike[]): Record<ImpactTier, number> {
  const counts: Record<ImpactTier, number> = { high: 0, medium: 0, low: 0 };
  for (const entry of entries) {
    if (entry.tier) counts[entry.tier] += 1;
  }
  return counts;
}

function peakExecutionWindowPattern(entries: TaskHistoryEntryLike[]): PersonalPattern | null {
  const highTimed = entries.filter(
    (entry) => entry.tier === "high" && getCompletionHour(entry) !== null,
  );
  const source = highTimed.length >= 2 ? highTimed : entries.filter((entry) => getCompletionHour(entry) !== null);
  if (source.length < 2) return null;

  const buckets = new Map<string, number>();
  for (const entry of source) {
    const hour = getCompletionHour(entry);
    if (hour === null) continue;
    const bucket = bucketForHour(hour);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] < 2) return null;

  // A clear winner makes the pattern more credible than a 2–2 tie.
  if (ranked[1] && ranked[1][1] === top[1] && top[1] === 2) return null;

  const isHighFocus = source === highTimed;
  return {
    id: "execution-window",
    title: isHighFocus
      ? `High-impact work lands ${top[0]}`
      : `Your strongest execution window is ${top[0]}`,
    detail: isHighFocus
      ? `You finish High-priority tasks most often ${top[0]} — ${top[1]} of ${source.length} high-impact closures.`
      : `Most of your task closures happen ${top[0]} (${top[1]} of ${source.length} logged closures).`,
    tone: "emerald",
  };
}

function tierStrengthPattern(entries: TaskHistoryEntryLike[]): PersonalPattern | null {
  const tiered = entries.filter((entry) => entry.tier);
  if (tiered.length < 3) return null;

  const counts = countByTier(tiered);
  const ranked = (Object.entries(counts) as Array<[ImpactTier, number]>).sort((a, b) => b[1] - a[1]);
  const [tier, count] = ranked[0] ?? ["high", 0];
  if (!count) return null;

  const percent = Math.round((count / tiered.length) * 100);
  const label = tier === "high" ? "High-impact" : tier === "medium" ? "Medium-impact" : "Low-impact";

  if (tier === "high") {
    return {
      id: "tier-strength",
      title: "High-impact work is your strongest lane",
      detail: `${label} priorities make up ${percent}% of your logged closures (${count} of ${tiered.length}). Protect that window.`,
      tone: "emerald",
    };
  }

  return {
    id: "tier-strength",
    title: `${label} work absorbs most of your closures`,
    detail: `${label} priorities are ${percent}% of your logged closures (${count} of ${tiered.length}). Rebalance one high-impact block tomorrow.`,
    tone: "amber",
  };
}

function weeklyMomentumPattern(entries: TaskHistoryEntryLike[]): PersonalPattern | null {
  if (entries.length < 2) return null;

  const current = countWithin(entries, 0, 6);
  const previous = countWithin(entries, 7, 13);
  if (current + previous < 2) return null;

  const delta = current - previous;
  const direction =
    delta > 0 ? `up ${delta} from the week before` : delta < 0 ? `down ${Math.abs(delta)} from the week before` : "level with the week before";
  const tone: PatternTone = delta > 0 ? "emerald" : delta < 0 ? "amber" : "sky";

  return {
    id: "weekly-momentum",
    title: delta > 0 ? "Momentum is rising" : delta < 0 ? "Momentum needs a reset" : "Momentum is holding",
    detail: `You closed ${current} priorit${current === 1 ? "y" : "ies"} in the last 7 days — ${direction}.`,
    tone,
  };
}

function weekdayPeakPattern(entries: TaskHistoryEntryLike[]): PersonalPattern | null {
  if (entries.length < 5) return null;

  const cutoff = localDateKey(startOfLocalDay(27));
  const recent = entries.filter((entry) => entry.date >= cutoff);
  if (recent.length < 5) return null;

  const counts = new Map<number, number>();
  for (const entry of recent) {
    const parsed = new Date(`${entry.date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    const day = parsed.getDay();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] < 2) return null;

  const weekday = new Date(2024, 0, 7 + top[0]).toLocaleDateString("en-US", { weekday: "long" });
  return {
    id: "weekday-peak",
    title: `${weekday} is your peak execution day`,
    detail: `${top[1]} closures landed on ${weekday}s over the last four weeks. Schedule your hardest task there.`,
    tone: "sky",
  };
}

function todayProgressPattern(tasks: Record<ImpactTier, Task[]> | undefined): PersonalPattern | null {
  const high = Array.isArray(tasks?.high) ? tasks.high : [];
  const total = high.length;
  if (total === 0) return null;
  const done = high.filter((task) => task.done).length;

  return {
    id: "today-high",
    title: done === total ? "High-impact matrix is clear" : "High-impact progress today",
    detail:
      done === total
        ? `All ${total} high-impact priorit${total === 1 ? "y is" : "ies are"} closed. Keep the streak alive with the daily focus action.`
        : `${done} of ${total} high-impact priorit${total === 1 ? "y" : "ies"} closed today. The next unclosed item is the one that moves the day.`,
    tone: done === total ? "emerald" : "amber",
  };
}

/**
 * Returns up to three plain-language patterns. When there is not enough data,
 * a single onboarding message explains how the engine learns.
 */
export function buildPersonalPatterns(input: {
  taskHistory?: TaskHistoryEntryLike[] | undefined;
  tasks?: Record<ImpactTier, Task[]> | undefined;
}): PersonalPattern[] {
  const entries = normalizeHistory(input.taskHistory);
  const patterns = [
    peakExecutionWindowPattern(entries),
    tierStrengthPattern(entries),
    weeklyMomentumPattern(entries),
    weekdayPeakPattern(entries),
    todayProgressPattern(input.tasks),
  ].filter((pattern): pattern is PersonalPattern => pattern !== null);

  if (patterns.length > 0) return patterns.slice(0, 3);

  return [
    {
      id: "warming-up",
      title: "Your pattern engine is warming up",
      detail: `Close a few priorities and ApexMission will surface your real execution pattern — starting with when your high-impact work lands. Today is ${todayKey()}.`,
      tone: "sky",
    },
  ];
}
