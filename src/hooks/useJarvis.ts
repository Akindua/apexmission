/**
 * useChiefOfStaff — React hook for managing AI Chief of Staff assistant state.
 *
 * Provides access to pending suggestions, apply/dismiss actions, and
 * generation triggers. AI Chief of Staff is a suggestive copilot — no suggestion is
 * applied without explicit user action.
 */

import { useCallback, useEffect, useState } from "react";
import {
  applySuggestion,
  clearChiefOfStaffSuggestions,
  dismissSuggestion,
  getChiefOfStaffSuggestions,
  getPendingSuggestions,
  setChiefOfStaffSuggestions,
  type ChiefOfStaffSuggestion,
} from "@/services/jarvis";

export function useChiefOfStaff() {
  const [suggestions, setSuggestionsState] = useState<ChiefOfStaffSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setSuggestionsState(getPendingSuggestions());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const apply = useCallback(
    (id: string) => {
      applySuggestion(id);
      refresh();
    },
    [refresh],
  );

  const dismiss = useCallback(
    (id: string) => {
      dismissSuggestion(id);
      refresh();
    },
    [refresh],
  );

  const clear = useCallback(() => {
    clearChiefOfStaffSuggestions();
    setSuggestionsState([]);
  }, []);

  const setSuggestions = useCallback((next: ChiefOfStaffSuggestion[]) => {
    setChiefOfStaffSuggestions(next);
    setSuggestionsState(getPendingSuggestions());
  }, []);

  return {
    suggestions,
    pendingCount: suggestions.length,
    loading,
    apply,
    dismiss,
    clear,
    setSuggestions,
    refresh,
  };
}