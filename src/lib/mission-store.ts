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
}

/** Free tier allows at most this many tasks across the whole matrix. */
export const FREE_TASK_LIMIT = 3;

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

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Milliseconds until the next local midnight (the 24h reset boundary). */
export function msUntilReset(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
