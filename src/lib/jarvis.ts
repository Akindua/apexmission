/**
 * AI Chief of Staff — Personal AI Assistant (Suggestive Copilot)
 *
 * The AI Chief of Staff operates strictly as a suggestive copilot: it generates proactive
 * nudges, workflow recommendations, and scheduling suggestions. Every
 * suggestion requires explicit user approval (tap/click to apply) before any
 * change is made to user data or system state. The AI never makes autonomous,
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
 * Local storage keys for AI Chief of Staff suggestions (per-account scoped).
 * These keys are deprecated; use the new keys from services/jarvis/local-persistence.ts
 */
const JARVIS_SUGGESTIONS_KEY = "jarvis-suggestions-v1";
const JARVIS_LAST_GENERATED_KEY = "jarvis-last-generated-v1";
const JARVIS_DISCLAIMER_ACK_KEY = "jarvis-disclaimer-ack-v1";

/**
 * Generates a stable, collision-resistant id for a new suggestion.
 * @deprecated Use generateSuggestionId from services/jarvis/context-builder.ts
 */
function generateSuggestionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `jarvis-${ts}-${rand}`;
}

/**
 * Reads all AI Chief of Staff suggestions from per-account local storage.
 * Migrates from legacy "jarvis-*" keys if present.
 * @deprecated Use getChiefOfStaffSuggestions from services/jarvis/local-persistence.ts
 */
export function getJarvisSuggestions(): JarvisSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    // Try new key first
    let raw = getScopedItem("chief-of-staff-suggestions-v1");
    // Fallback: migrate from legacy key
    if (!raw) {
      const legacy = getScopedItem("jarvis-suggestions-v1");
      if (legacy) {
        raw = legacy;
        setScopedItem("chief-of-staff-suggestions-v1", legacy);
        removeScopedItem("jarvis-suggestions-v1");
      }
    }
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
 * @deprecated Use setChiefOfStaffSuggestions from services/jarvis/local-persistence.ts
 */
export function setJarvisSuggestions(suggestions: JarvisSuggestion[]): void {
  if (typeof window === "undefined") return;
  setScopedItem("chief-of-staff-suggestions-v1", JSON.stringify(suggestions));
}

/**
 * Returns only pending (not yet applied or dismissed) suggestions.
 * @deprecated Use getPendingSuggestions from services/jarvis/local-persistence.ts
 */
export function getPendingSuggestions(): JarvisSuggestion[] {
  return getJarvisSuggestions().filter((s) => s.status === "pending");
}

/**
 * Marks a suggestion as applied (user tapped "Apply").
 * @deprecated Use applySuggestion from services/jarvis/local-persistence.ts
 */
export function applySuggestion(id: string): void {
  const suggestions = getJarvisSuggestions().map((s) =>
    s.id === id ? { ...s, status: "applied" as const } : s,
  );
  setJarvisSuggestions(suggestions);
}

/**
 * Marks a suggestion as dismissed (user tapped "Dismiss").
 * @deprecated Use dismissSuggestion from services/jarvis/local-persistence.ts
 */
export function dismissSuggestion(id: string): void {
  const suggestions = getJarvisSuggestions().map((s) =>
    s.id === id ? { ...s, status: "dismissed" as const } : s,
  );
  setJarvisSuggestions(suggestions);
}

/**
 * Clears all suggestions (used on sign-out).
 * @deprecated Use clearChiefOfStaffSuggestions from services/jarvis/local-persistence.ts
 */
export function clearJarvisSuggestions(): void {
  removeScopedItem("jarvis-suggestions-v1");
  removeScopedItem("jarvis-last-generated-v1");
  removeScopedItem("chief-of-staff-suggestions-v1");
  removeScopedItem("chief-of-staff-last-generated-v1");
}

/**
 * Returns true if the user has acknowledged the AI Chief of Staff legal disclaimer.
 * Checks new key first, then migrates from legacy key.
 * @deprecated Use hasChiefOfStaffDisclaimerAck from services/jarvis/local-persistence.ts
 */
export function hasJarvisDisclaimerAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    let ack = getScopedItem("chief-of-staff-disclaimer-ack-v1");
    if (!ack) {
      const legacy = getScopedItem("jarvis-disclaimer-ack-v1");
      if (legacy) {
        ack = legacy;
        setScopedItem("chief-of-staff-disclaimer-ack-v1", legacy);
        removeScopedItem("jarvis-disclaimer-ack-v1");
      }
    }
    return ack === "true";
  } catch {
    return false;
  }
}

/**
 * Records that the user has acknowledged the AI Chief of Staff legal disclaimer.
 * @deprecated Use setChiefOfStaffDisclaimerAck from services/jarvis/local-persistence.ts
 */
export function setJarvisDisclaimerAck(): void {
  if (typeof window === "undefined") return;
  setScopedItem("chief-of-staff-disclaimer-ack-v1", "true");
}

/**
 * Returns the ISO timestamp of the last suggestion generation, or null.
 * Checks new key first, then migrates from legacy key.
 * @deprecated Use getChiefOfStaffLastGenerated from services/jarvis/local-persistence.ts
 */
export function getJarvisLastGenerated(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let ts = getScopedItem("chief-of-staff-last-generated-v1");
    if (!ts) {
      const legacy = getScopedItem("jarvis-last-generated-v1");
      if (legacy) {
        ts = legacy;
        setScopedItem("chief-of-staff-last-generated-v1", legacy);
        removeScopedItem("jarvis-last-generated-v1");
      }
    }
    return ts;
  } catch {
    return null;
  }
}

/**
 * Records when suggestions were last generated.
 * @deprecated Use setChiefOfStaffLastGenerated from services/jarvis/local-persistence.ts
 */
export function setJarvisLastGenerated(): void {
  if (typeof window === "undefined") return;
  setScopedItem("chief-of-staff-last-generated-v1", new Date().toISOString());
}

/**
 * Builds a minimal, privacy-safe context object for the AI Chief of Staff LLM prompt.
 * No PII (email, tenant ids, UUIDs, rank, tier) is included.
 * @deprecated Use buildChiefOfStaffContext from services/jarvis/context-builder.ts
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