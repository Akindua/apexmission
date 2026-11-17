/**
 * Jarvis context builder — AI context builder for suggestion generation.
 *
 * Builds a minimal, privacy-safe context object for the Jarvis LLM prompt.
 * No PII (email, tenant IDs, UUIDs, rank, tier) is included.
 */

export type ImpactTier = "high" | "medium" | "low";

export interface Task {
  id?: string;
  text: string;
  tier?: ImpactTier;
  done: boolean;
}

export interface JarvisContext {
  firstName: string;
  mission: string | null;
  highTasks: Array<{ id: string; text: string; done: boolean }>;
  mediumTasks: Array<{ id: string; text: string; done: boolean }>;
  lowTasks: Array<{ id: string; text: string; done: boolean }>;
  dailyAction: string | null;
  dailyDone: boolean;
  streakCount: number;
}

export interface JarvisSuggestion {
  id: string;
  type: JarvisSuggestionType;
  title: string;
  body: string;
  rationale: string;
  suggestedAction: string; // human-readable description of what applying does
  appliesTo: "task" | "schedule" | "focus" | "routine";
  createdAt: string; // ISO timestamp
  status: "pending" | "applied" | "dismissed";
  // Optional reference to a task id this suggestion relates to
  taskId?: string;
  // AI-generated confidence (0-100), for display only — never used to auto-apply
  confidence?: number;
}

export type JarvisSuggestionType = "nudge" | "workflow" | "schedule";

/**
 * Generates a stable, collision-resistant id for a new suggestion.
 */
export function generateSuggestionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `jarvis-${ts}-${rand}`;
}

/**
 * Builds a minimal, privacy-safe context object for the Jarvis LLM prompt.
 * No PII (email, tenant ids, UUIDs, rank, tier) is included.
 */
export function buildJarvisContext(state: {
  mission: string | null;
  tasks: Record<string, Array<{ id: string; text: string; done: boolean }>>;
  daily: { text: string; done: boolean };
  streak: { count: number };
  userName: string | null;
}): JarvisContext {
  const firstName = (state.userName ?? "Operator").split(" ")[0];
  const allTasks = [
    ...(state.tasks["high"] ?? []),
    ...(state.tasks["medium"] ?? []),
    ...(state.tasks["low"] ?? []),
  ];
  return {
    firstName,
    mission: state.mission ?? null,
    highTasks: state.tasks["high"] ?? [],
    mediumTasks: state.tasks["medium"] ?? [],
    lowTasks: state.tasks["low"] ?? [],
    dailyAction: state.daily.text || null,
    dailyDone: state.daily.done,
    streakCount: state.streak.count,
    // allTasks is not part of JarvisContext but useful for callers
  } as JarvisContext & { allTasks: typeof allTasks };
}
