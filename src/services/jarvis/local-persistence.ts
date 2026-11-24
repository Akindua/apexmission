/**
 * AI Chief of Staff local persistence — per-account scoped storage for suggestions.
 *
 * Stores Chief of Staff suggestions in browser localStorage, scoped to the signed-in
 * user. All operations are synchronous reads needed by the dashboard.
 */

import { getScopedItem, setScopedItem, removeScopedItem } from "@/lib/user-storage";
import type { ChiefOfStaffSuggestion } from "./context-builder";

// ---------------------------------------------------------------------------
// Local storage keys for AI Chief of Staff suggestions (per-account scoped).
// ---------------------------------------------------------------------------

const CHIEF_OF_STAFF_SUGGESTIONS_KEY = "chief-of-staff-suggestions-v1";
const CHIEF_OF_STAFF_LAST_GENERATED_KEY = "chief-of-staff-last-generated-v1";
const CHIEF_OF_STAFF_DISCLAIMER_ACK_KEY = "chief-of-staff-disclaimer-ack-v1";

/**
 * Reads all AI Chief of Staff suggestions from per-account local storage.
 * Migrates from legacy "jarvis-*" keys if present.
 */
export function getChiefOfStaffSuggestions(): ChiefOfStaffSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    // Try new key first
    let raw = getScopedItem(CHIEF_OF_STAFF_SUGGESTIONS_KEY);
    // Fallback: migrate from legacy key
    if (!raw) {
      const legacy = getScopedItem("jarvis-suggestions-v1");
      if (legacy) {
        raw = legacy;
        setScopedItem(CHIEF_OF_STAFF_SUGGESTIONS_KEY, legacy);
        removeScopedItem("jarvis-suggestions-v1");
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChiefOfStaffSuggestion[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Persists the full suggestions array to per-account local storage.
 */
export function setChiefOfStaffSuggestions(suggestions: ChiefOfStaffSuggestion[]): void {
  if (typeof window === "undefined") return;
  setScopedItem(CHIEF_OF_STAFF_SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/**
 * Returns only pending (not yet applied or dismissed) suggestions.
 */
export function getPendingSuggestions(): ChiefOfStaffSuggestion[] {
  return getChiefOfStaffSuggestions().filter((s) => s.status === "pending");
}

/**
 * Marks a suggestion as applied (user tapped "Apply").
 */
export function applySuggestion(id: string): void {
  const suggestions = getChiefOfStaffSuggestions().map((s) =>
    s.id === id ? { ...s, status: "applied" as const } : s,
  );
  setChiefOfStaffSuggestions(suggestions);
}

/**
 * Marks a suggestion as dismissed (user tapped "Dismiss").
 */
export function dismissSuggestion(id: string): void {
  const suggestions = getChiefOfStaffSuggestions().map((s) =>
    s.id === id ? { ...s, status: "dismissed" as const } : s,
  );
  setChiefOfStaffSuggestions(suggestions);
}

/**
 * Clears all suggestions (used on sign-out).
 */
export function clearChiefOfStaffSuggestions(): void {
  removeScopedItem(CHIEF_OF_STAFF_SUGGESTIONS_KEY);
  removeScopedItem(CHIEF_OF_STAFF_LAST_GENERATED_KEY);
}

/**
 * Returns true if the user has acknowledged the AI Chief of Staff legal disclaimer.
 * Checks new key first, then migrates from legacy key.
 */
export function hasChiefOfStaffDisclaimerAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    let ack = getScopedItem(CHIEF_OF_STAFF_DISCLAIMER_ACK_KEY);
    if (!ack) {
      const legacy = getScopedItem("jarvis-disclaimer-ack-v1");
      if (legacy) {
        ack = legacy;
        setScopedItem(CHIEF_OF_STAFF_DISCLAIMER_ACK_KEY, legacy);
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
 */
export function setChiefOfStaffDisclaimerAck(): void {
  if (typeof window === "undefined") return;
  setScopedItem(CHIEF_OF_STAFF_DISCLAIMER_ACK_KEY, "true");
}

/**
 * Returns the ISO timestamp of the last suggestion generation, or null.
 * Checks new key first, then migrates from legacy key.
 */
export function getChiefOfStaffLastGenerated(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let ts = getScopedItem(CHIEF_OF_STAFF_LAST_GENERATED_KEY);
    if (!ts) {
      const legacy = getScopedItem("jarvis-last-generated-v1");
      if (legacy) {
        ts = legacy;
        setScopedItem(CHIEF_OF_STAFF_LAST_GENERATED_KEY, legacy);
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
 */
export function setChiefOfStaffLastGenerated(): void {
  if (typeof window === "undefined") return;
  setScopedItem(CHIEF_OF_STAFF_LAST_GENERATED_KEY, new Date().toISOString());
}