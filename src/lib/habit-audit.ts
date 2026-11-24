/**
 * Habit Audit — Weekly progress audit for AI Chief of Staff.
 *
 * Compiles the user's weekly task completion stats and generates an
 * AI Chief of Staff recap every Sunday evening. All processing is client-side;
 * no data is sent to any server except the AI Chief of Staff LLM endpoint which
 * uses zero-data-retention headers.
 */

import { todayKey, type MissionState } from "@/lib/mission-store";
import { generateChiefOfStaffSuggestions, type ChiefOfStaffContext } from "@/services/jarvis";
import { getScopedItem, setScopedItem } from "@/lib/user-storage";

const HABIT_AUDIT_KEY = "habit-audit-last-generated";
const WEEKLY_AUDIT_DAY = 0; // Sunday

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  streakCount: number;
  dailyCompletion: Array<{ date: string; completed: number; total: number }>;
  bestDay: string | null;
  worstDay: string | null;
}

/**
 * Check if today is Sunday (weekly audit day).
 */
export function isSunday(): boolean {
  if (typeof window === "undefined") return false;
  return new Date().getDay() === WEEKLY_AUDIT_DAY;
}

/**
 * Get the date key for N days ago in the user's local timezone.
 */
function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/\//g, "-");
}

/**
 * Compute weekly stats from the mission state.
 * Aggregates task completion across all tiers and the last 7 days.
 */
export function computeWeeklyStats(state: MissionState): WeeklyStats {
  const today = todayKey();
  const weekStart = daysAgoKey(6);

  const allTasks = [
    ...(state.tasks?.high ?? []),
    ...(state.tasks?.medium ?? []),
    ...(state.tasks?.low ?? []),
  ];

  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.done).length;
  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // Build daily completion from reflection history (last 7 days)
  const dailyCompletion: Array<{ date: string; completed: number; total: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = daysAgoKey(i);
    const dayCompletions =
      state.reflectionHistory?.filter(
        (entry) => entry.date === date && entry.actionCompleted === true,
      ).length ?? 0;
    dailyCompletion.push({
      date,
      completed: dayCompletions,
      total: 1, // one daily action per day
    });
  }

  // Find best and worst days by completion
  const withCompletions = dailyCompletion.filter((d) => d.total > 0);
  let bestDay: string | null = null;
  let worstDay: string | null = null;

  if (withCompletions.length > 0) {
    const sorted = [...withCompletions].sort((a, b) => b.completed - a.completed);
    bestDay = sorted[0]?.date ?? null;
    worstDay = sorted[sorted.length - 1]?.date ?? null;
    if (sorted[0]?.completed === sorted[sorted.length - 1]?.completed) {
      worstDay = null; // all days equal, no distinct worst day
    }
  }

  return {
    weekStart,
    weekEnd: today,
    totalTasks,
    completedTasks,
    completionRate,
    streakCount: state.streak?.count ?? 0,
    dailyCompletion,
    bestDay,
    worstDay,
  };
}

/**
 * Build an AI Chief of Staff context from weekly stats for the habit audit prompt.
 */
export function buildHabitAuditContext(state: MissionState, stats: WeeklyStats): ChiefOfStaffContext {
  return {
    firstName: (state.userName ?? "Operator").split(" ")[0] ?? "",
    mission: state.mission ?? null,
    highTasks: (state.tasks?.high ?? []).map((t) => ({
      id: t.id ?? "",
      text: t.text,
      done: t.done,
    })),
    mediumTasks: (state.tasks?.medium ?? []).map((t) => ({
      id: t.id ?? "",
      text: t.text,
      done: t.done,
    })),
    lowTasks: (state.tasks?.low ?? []).map((t) => ({
      id: t.id ?? "",
      text: t.text,
      done: t.done,
    })),
    dailyAction: state.daily?.text || null,
    dailyDone: state.daily?.done ?? false,
    streakCount: state.streak?.count ?? 0,
  };
}

/**
 * Check if a weekly audit has already been generated this week.
 */
export function hasWeeklyAuditThisWeek(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const lastGenerated = getScopedItem(HABIT_AUDIT_KEY);
    if (!lastGenerated) return false;
    const lastDate = new Date(lastGenerated);
    const today = new Date();
    return (
      lastDate.getFullYear() === today.getFullYear() &&
      Math.floor(
        (lastDate.getTime() - new Date(lastDate.getFullYear(), 0, 1).getTime()) / 86400000 / 7,
      ) ===
        Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000 / 7)
    );
  } catch {
    return false;
  }
}

/**
 * Generate a weekly habit audit using AI Chief of Staff.
 * Returns the audit text or null if already generated this week.
 */
export async function generateWeeklyHabitAudit(state: MissionState): Promise<string | null> {
  if (hasWeeklyAuditThisWeek()) return null;

  const stats = computeWeeklyStats(state);
  const context = buildHabitAuditContext(state, stats);

  try {
    const suggestions = await generateChiefOfStaffSuggestions(context);

    const auditText = buildAuditText(stats, suggestions);

    setScopedItem(HABIT_AUDIT_KEY, new Date().toISOString());

    return auditText;
  } catch (err) {
    console.error("[HabitAudit] Failed to generate weekly audit:", err);
    return null;
  }
}

/**
 * Build a human-readable weekly audit text from stats and AI Chief of Staff suggestions.
 */
function buildAuditText(stats: WeeklyStats, suggestions: Array<{ body: string }>): string {
  const lines: string[] = [];

  lines.push("Here's how your week went:");
  lines.push(
    `You completed ${stats.completedTasks} of ${stats.totalTasks} tasks (${stats.completionRate}% completion rate).`,
  );
  lines.push(
    `Your current streak is ${stats.streakCount} day${stats.streakCount === 1 ? "" : "s"}.`,
  );

  if (stats.bestDay) {
    lines.push(`Your strongest day was ${stats.bestDay}.`);
  }
  if (stats.worstDay && stats.worstDay !== stats.bestDay) {
    lines.push(`Your toughest day was ${stats.worstDay}.`);
  }

  if (suggestions.length > 0) {
    lines.push("");
    lines.push("AI Chief of Staff recommends:");
    suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.body}`);
    });
  }

  return lines.join("\n");
}