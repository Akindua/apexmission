export type ImpactTier = "high" | "medium" | "low";

export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface MissionState {
  mission: string;
  tasks: Record<ImpactTier, Task[]>;
  daily: { text: string; done: boolean; date: string };
  streak: { count: number; lastCompletedDate: string | null };
  premium: boolean;
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
    premium: false,

  };
}

/** Loads state and applies the 24h reset + streak decay rules. */
export function loadState(): MissionState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as MissionState;
    const state: MissionState = { ...defaultState(), ...parsed, tasks: { ...defaultState().tasks, ...parsed.tasks } };

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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — non-fatal
  }
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
