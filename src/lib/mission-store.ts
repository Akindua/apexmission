import { getScopedItem, setScopedItem } from "@/lib/user-storage";

export type ImpactTier = "high" | "medium" | "low";

export interface Task {
  id?: string;
  text: string;
  tier?: ImpactTier;
  done: boolean;
}

export interface ReflectionEntry {
  date: string;
  phase: "morning" | "night";
  wins: string;
  blockers: string;
  tomorrowAction: string;
  dailyAction?: string;
  actionCompleted?: boolean | null;
  routineSealed?: number;
  createdAt: string;
  /** True when the entry was captured with the 10-second voice logger. */
  voice?: boolean;
  transcript?: string;
}

/** A task closure stamped with the local execution date and hour. */
export interface TaskCompletionEvent {
  date: string;
  text?: string;
  tier?: ImpactTier;
  /** ISO timestamp captured at the moment the task was closed. */
  completedAt?: string;
}

/** Frozen copy of a day's priority matrix, used for next-day rollover. */
export interface DayPlanSnapshot {
  date: string;
  tasks: Record<ImpactTier, Task[]>;
  dailyAction: string;
  createdAt: string;
}

/** What the AI rollover carried from the previous day into today. */
export interface RolloverSummary {
  fromDate: string | null;
  toDate: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface MissionState {
  mission: string;
  tasks: Record<ImpactTier, Task[]>;
  daily: { text: string; done: boolean; date: string };
  streak: { count: number; lastCompletedDate: string | null };
  reflection: {
    wins: string;
    blockers: string;
    tomorrowAction: string;
    completedToday?: boolean | null;
    date?: string;
  };
  reflectionHistory: ReflectionEntry[];
  points?: number;
  userName?: string;
  premium?: boolean;
  lastMorningBriefingDate?: string | null;
  lockdownModeActive: boolean;
  lockdownTimerSeconds: number;
  consecutiveDaysFailedTasks: number;
  currentLeaderboardRank: string;
  /** Local date the current priority matrix belongs to. */
  planDate?: string;
  /** Last 14 archived plans (one per day). */
  planHistory?: DayPlanSnapshot[];
}

/** Free tier allows at most this many tasks across the whole matrix. */
export const FREE_TASK_LIMIT = 3;

/** Hard caps so operator-authored mission text cannot be abused downstream. */
export const MAX_TASK_TEXT_LENGTH = 300;
export const MAX_MISSION_TEXT_LENGTH = 500;
export const MAX_DAILY_ACTION_LENGTH = 300;
export const MAX_TASKS_PER_TIER = 25;

/** Hard cap for AI-generated task lists coming back from the planner. */
export const MAX_GENERATED_TASKS_PER_TIER = 10;

/** How many real task closures are retained per operator for pattern analysis. */
export const TASK_HISTORY_LIMIT = 200;

/** Simulated AI breakdown of a mission into 3 concrete high-impact tasks. */
export function aiBreakdown(mission: string): string[] {
  const m = mission.trim().replace(/[.!]$/, "") || "your mission";
  return [
    `Define the single clearest success metric for "${m}"`,
    `Block 90 focused minutes daily to move "${m}" forward`,
    `Identify and remove the biggest blocker to "${m}" this week`,
  ];
}

const STORAGE_KEY = "mission-control-state-v1";

/** Returns the user's IANA timezone (e.g., "America/Los_Angeles"). */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Returns today's date key (YYYY-MM-DD) in the user's local timezone. */
export function todayKey(tz?: string): string {
  const timeZone = tz || getUserTimezone();
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/\//g, "-");
}

/** Milliseconds until the next local midnight (the 24h reset boundary) in the user's timezone. */
export function msUntilReset(tz?: string): number {
  const timeZone = tz || getUserTimezone();
  const now = new Date();
  // Get midnight in the target timezone (tomorrow 00:00:00 in that TZ)
  const midnightStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  // Parse "YYYY-MM-DD, HH:MM:SS" in the target timezone
  const parts = midnightStr.split(", ");
  const datePart = parts[0];
  const timePart = parts[1];
  if (!datePart || !timePart) return 86_400_000; // fallback 24h
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const [hourStr, minuteStr, secondStr] = timePart.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
      !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    return 86_400_000;
  }
  // Create a Date at midnight in the target timezone (interpreted as UTC)
  const midnight = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Math.max(0, midnight.getTime() - now.getTime());
}

function yesterdayKey(tz?: string): string {
  const timeZone = tz || getUserTimezone();
  const d = new Date();
  // Subtract one day in the target timezone
  const tomorrow = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(tomorrow)
    .replace(/\//g, "-");
}

export function defaultState(): MissionState {
  return {
    mission: "",
    tasks: { high: [], medium: [], low: [] },
    daily: { text: "", done: false, date: todayKey() },
    streak: { count: 0, lastCompletedDate: null },
    reflection: {
      wins: "",
      blockers: "",
      tomorrowAction: "",
    },
    reflectionHistory: [],
    lastMorningBriefingDate: null,
    premium: false,
    lockdownModeActive: false,
    lockdownTimerSeconds: 0,
    consecutiveDaysFailedTasks: 0,
    currentLeaderboardRank: "",
    planDate: todayKey(),
    planHistory: [],
  };
}

/** Loads state and applies the 24h reset + streak decay rules. */
export function loadState(): MissionState {
  try {
    const raw = getScopedItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as MissionState;
    const state: MissionState = {
      ...defaultState(),
      ...parsed,
      tasks: { ...defaultState().tasks, ...parsed.tasks },
      reflection: { ...defaultState().reflection, ...parsed.reflection },
      reflectionHistory: Array.isArray(parsed.reflectionHistory) ? parsed.reflectionHistory : [],
    };

    const today = todayKey();
    // Daily action resets every day
    if (state.daily.date !== today) {
      state.daily = { text: state.daily.text, done: false, date: today };
    }
    // Streak decays if the last completion was before yesterday
    if (
      state.streak.lastCompletedDate &&
      state.streak.lastCompletedDate !== today &&
      state.streak.lastCompletedDate !== yesterdayKey()
    ) {
      state.streak = { count: 0, lastCompletedDate: null };
    }
    return state;
  } catch {
    return defaultState();
  }
}

export function saveState(state: MissionState): void {
  setScopedItem(STORAGE_KEY, JSON.stringify(state));
}

/** Returns updated streak after the daily action is completed today. */
export function completeDailyToday(streak: MissionState["streak"]): MissionState["streak"] {
  const today = todayKey();
  if (streak.lastCompletedDate === today) return streak;
  if (streak.lastCompletedDate === yesterdayKey()) {
    return { count: streak.count + 1, lastCompletedDate: today };
  }
  return { count: 1, lastCompletedDate: today };
}

/**
 * Appends a morning/night reflection entry while keeping one record per
 * phase per day. The Zero-API engine reads this history to critique the
 * operator's reflection discipline across past sessions.
 */
export function appendReflectionEntry(
  history: ReflectionEntry[] | undefined,
  entry: ReflectionEntry,
): ReflectionEntry[] {
  const existing = Array.isArray(history) ? history : [];
  const withoutDuplicate = existing.filter(
    (item) => !(item.date === entry.date && item.phase === entry.phase),
  );
  return [...withoutDuplicate, entry]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-30);
}

// New functions to update the state properties
export function setLockdownMode(state: MissionState, active: boolean): MissionState {
  return { ...state, lockdownModeActive: active };
}

export function tickLockdownTimer(state: MissionState): MissionState {
  if (state.lockdownTimerSeconds > 0) {
    return {
      ...state,
      lockdownTimerSeconds: state.lockdownTimerSeconds - 1,
      lockdownModeActive: false,
    };
  }
  return state;
}

export function incrementFailedDays(state: MissionState): MissionState {
  return { ...state, consecutiveDaysFailedTasks: state.consecutiveDaysFailedTasks + 1 };
}

export function resetFailedDays(state: MissionState): MissionState {
  return { ...state, consecutiveDaysFailedTasks: 0 };
}

/* -------------------------------------------------------------------------- */
/* DAILY PLAN ROLLOVER                                                        */
/* -------------------------------------------------------------------------- */

function cloneTier(tasks: Task[] | undefined): Task[] {
  return (Array.isArray(tasks) ? tasks : []).map((task) => ({ ...task }));
}

function cloneMatrix(tasks: Record<ImpactTier, Task[]> | undefined): Record<ImpactTier, Task[]> {
  return {
    high: cloneTier(tasks?.high),
    medium: cloneTier(tasks?.medium),
    low: cloneTier(tasks?.low),
  };
}

export function countTasks(tasks: Record<ImpactTier, Task[]> | undefined): number {
  return (
    (tasks?.high?.length ?? 0) + (tasks?.medium?.length ?? 0) + (tasks?.low?.length ?? 0)
  );
}

/** Unfinished priorities, tier by tier, with any stale `done` flags corrected. */
export function getUnfinishedTasks(
  tasks: Record<ImpactTier, Task[]> | undefined,
): Record<ImpactTier, Task[]> {
  const pending = (tier?: Task[]) =>
    (Array.isArray(tier) ? tier : [])
      .filter((task) => !task.done)
      .map((task) => ({ ...task, done: false }))
      .slice(0, MAX_TASKS_PER_TIER);

  return {
    high: pending(tasks?.high),
    medium: pending(tasks?.medium),
    low: pending(tasks?.low),
  };
}

/**
 * Copies the matrix into a plain JSON-safe shape for the company plan column.
 * Only the fields the dashboard needs are retained.
 */
export function serializeTaskMatrix(
  tasks: Record<ImpactTier, Task[]> | undefined,
): Record<ImpactTier, Task[]> {
  const copy = (tier?: Task[]) =>
    (Array.isArray(tier) ? tier : []).slice(0, MAX_TASKS_PER_TIER).map((task) => {
      const next: Task = {
        text: task.text.slice(0, MAX_TASK_TEXT_LENGTH),
        done: task.done === true,
      };
      if (task.tier) next.tier = task.tier;
      if (typeof task.id === "string") next.id = task.id;
      return next;
    });

  return {
    high: copy(tasks?.high),
    medium: copy(tasks?.medium),
    low: copy(tasks?.low),
  };
}

/** Coerces an untrusted JSONB plan column into a safe task matrix. */
export function normalizeTaskMatrix(raw: unknown): Record<ImpactTier, Task[]> {
  const root =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const parseTier = (value: unknown): Task[] => {
    if (!Array.isArray(value)) return [];

    const tasks: Task[] = [];
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const text =
        typeof obj["text"] === "string"
          ? obj["text"].trim().slice(0, MAX_TASK_TEXT_LENGTH)
          : "";
      if (!text) continue;

      const task: Task = { text, done: obj["done"] === true };
      if (typeof obj["id"] === "string") task.id = obj["id"];
      if (obj["tier"] === "high" || obj["tier"] === "medium" || obj["tier"] === "low") {
        task.tier = obj["tier"];
      }

      tasks.push(task);
      if (tasks.length >= MAX_TASKS_PER_TIER) break;
    }

    return tasks;
  };

  return {
    high: parseTier(root["high"]),
    medium: parseTier(root["medium"]),
    low: parseTier(root["low"]),
  };
}

/**
 * Archives yesterday's matrix and rebuilds today's matrix from every unfinished
 * High / Medium / Low priority. Runs once per local day:
 *
 *  - A state without a `planDate` is treated as a first run. The matrix is kept
 *    as-is and stamped with today's date, so no work is destroyed on rollout.
 *  - On a new day the previous matrix is snapshotted into `planHistory` and
 *    only unfinished priorities are carried forward. Completed work is retired.
 */
export function reconcileDailyPlan(state: MissionState): {
  state: MissionState;
  rollover: RolloverSummary | null;
} {
  const today = todayKey();
  const history = Array.isArray(state.planHistory) ? [...state.planHistory] : [];
  const historyDates = history.map((entry) => entry.date).sort();
  const previousPlanDate =
    typeof state.planDate === "string"
      ? state.planDate
      : historyDates.length > 0
        ? historyDates[historyDates.length - 1]
        : null;

  // First run on this browser: adopt today as the matrix date without wiping it.
  if (!previousPlanDate) {
    return {
      state: { ...state, planDate: today, planHistory: history.slice(-14) },
      rollover: null,
    };
  }

  if (previousPlanDate === today) {
    return { state: { ...state, planDate: today, planHistory: history.slice(-14) }, rollover: null };
  }

  const currentMatrix = cloneMatrix(state.tasks);
  const snapshot: DayPlanSnapshot | null =
    countTasks(currentMatrix) > 0
      ? {
          date: previousPlanDate,
          tasks: currentMatrix,
          dailyAction: state.daily?.text ?? "",
          createdAt: new Date().toISOString(),
        }
      : null;

  const nextHistory = (
    snapshot ? [...history.filter((entry) => entry.date !== previousPlanDate), snapshot] : history
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const sourceMatrix = snapshot ? snapshot.tasks : currentMatrix;
  const carried = getUnfinishedTasks(sourceMatrix);
  const rollover: RolloverSummary = {
    fromDate: previousPlanDate,
    toDate: today,
    high: carried.high.length,
    medium: carried.medium.length,
    low: carried.low.length,
    total: countTasks(carried),
  };

  return {
    state: {
      ...state,
      tasks: carried,
      planDate: today,
      planHistory: nextHistory,
      daily: { ...state.daily, date: today, done: false },
    },
    rollover,
  };
}

/** Plain-language description of what the rollover carried into today. */
export function describeRollover(summary: RolloverSummary | null): string {
  if (!summary) return "Today's matrix is already active.";
  if (summary.total === 0) {
    return "No unfinished priorities were carried over. Your matrix is clear — set today's highest-impact objective.";
  }
  return `${summary.high} High, ${summary.medium} Medium, and ${summary.low} Low unfinished priorit${
    summary.total === 1 ? "y was" : "ies were"
  } carried into today's plan from ${summary.fromDate ?? "the previous plan"}.`;
}
