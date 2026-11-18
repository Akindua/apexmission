/**
 * Jarvis — Personal AI Assistant (Suggestive Copilot)
 *
 * Jarvis operates strictly as a suggestive copilot: it generates proactive
 * nudges, workflow recommendations, and scheduling suggestions. Every
 * suggestion requires explicit user approval (tap/click to apply) before any
 * change is made to user data or system state. Jarvis never makes autonomous,
 * irreversible modifications.
 *
 * Privacy design:
 *   - All suggestions are stored locally first (IndexedDB/localStorage)
 *   - Prompts sent to the LLM are sanitized and fenced; no PII is included
 *   - Third-party LLM calls carry zero-data-retention / zero-training headers
 *   - Sensitive personal data is never stored in plain text on unsecured
 *     cloud endpoints
 */

import { getScopedItem, setScopedItem, removeScopedItem } from "@/lib/user-storage";

export type JarvisSuggestionType = "nudge" | "workflow" | "schedule";

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

/**
 * Local storage keys for Jarvis suggestions (per-account scoped).
 */
const JARVIS_SUGGESTIONS_KEY = "jarvis-suggestions-v1";
const JARVIS_LAST_GENERATED_KEY = "jarvis-last-generated-v1";
const JARVIS_DISCLAIMER_ACK_KEY = "jarvis-disclaimer-ack-v1";

/**
 * Generates a stable, collision-resistant id for a new suggestion.
 */
function generateSuggestionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `jarvis-${ts}-${rand}`;
}

/**
 * Reads all Jarvis suggestions from per-account local storage.
 */
export function getJarvisSuggestions(): JarvisSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getScopedItem(JARVIS_SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JarvisSuggestion[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Persists the full suggestions array to per-account local storage.
 */
export function setJarvisSuggestions(suggestions: JarvisSuggestion[]): void {
  if (typeof window === "undefined") return;
  setScopedItem(JARVIS_SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/**
 * Returns only pending (not yet applied or dismissed) suggestions.
 */
export function getPendingSuggestions(): JarvisSuggestion[] {
  return getJarvisSuggestions().filter((s) => s.status === "pending");
}

/**
 * Marks a suggestion as applied (user tapped "Apply").
 */
export function applySuggestion(id: string): void {
  const suggestions = getJarvisSuggestions().map((s) =>
    s.id === id ? { ...s, status: "applied" as const } : s,
  );
  setJarvisSuggestions(suggestions);
}

/**
 * Marks a suggestion as dismissed (user tapped "Dismiss").
 */
export function dismissSuggestion(id: string): void {
  const suggestions = getJarvisSuggestions().map((s) =>
    s.id === id ? { ...s, status: "dismissed" as const } : s,
  );
  setJarvisSuggestions(suggestions);
}

/**
 * Clears all suggestions (used on sign-out).
 */
export function clearJarvisSuggestions(): void {
  removeScopedItem(JARVIS_SUGGESTIONS_KEY);
  removeScopedItem(JARVIS_LAST_GENERATED_KEY);
}

/**
 * Returns true if the user has acknowledged the Jarvis legal disclaimer.
 */
export function hasJarvisDisclaimerAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return getScopedItem(JARVIS_DISCLAIMER_ACK_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Records that the user has acknowledged the Jarvis legal disclaimer.
 */
export function setJarvisDisclaimerAck(): void {
  if (typeof window === "undefined") return;
  setScopedItem(JARVIS_DISCLAIMER_ACK_KEY, "true");
}

/**
 * Returns the ISO timestamp of the last suggestion generation, or null.
 */
export function getJarvisLastGenerated(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return getScopedItem(JARVIS_LAST_GENERATED_KEY);
  } catch {
    return null;
  }
}

/**
 * Records when suggestions were last generated.
 */
export function setJarvisLastGenerated(): void {
  if (typeof window === "undefined") return;
  setScopedItem(JARVIS_LAST_GENERATED_KEY, new Date().toISOString());
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
