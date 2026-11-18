/**
 * Jarvis local persistence — per-account scoped storage for suggestions.
 *
 * Stores Jarvis suggestions in browser localStorage, scoped to the signed-in
 * user. All operations are synchronous reads needed by the dashboard.
 */

import { getScopedItem, setScopedItem, removeScopedItem } from "@/lib/user-storage";
import type { JarvisSuggestion } from "./context-builder";

// ---------------------------------------------------------------------------
// Local storage keys for Jarvis suggestions (per-account scoped).
// ---------------------------------------------------------------------------

const JARVIS_SUGGESTIONS_KEY = "jarvis-suggestions-v1";
const JARVIS_LAST_GENERATED_KEY = "jarvis-last-generated-v1";
const JARVIS_DISCLAIMER_ACK_KEY = "jarvis-disclaimer-ack-v1";

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
    s.id === id ? { ...s, status: "applied" as const } : s
  );
  setJarvisSuggestions(suggestions);
}

/**
 * Marks a suggestion as dismissed (user tapped "Dismiss").
 */
export function dismissSuggestion(id: string): void {
  const suggestions = getJarvisSuggestions().map((s) =>
    s.id === id ? { ...s, status: "dismissed" as const } : s
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
