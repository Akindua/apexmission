/**
 * useJarvis — React hook for managing Jarvis AI assistant state.
 *
 * Provides access to pending suggestions, apply/dismiss actions, and
 * generation triggers. Jarvis is a suggestive copilot — no suggestion is
 * applied without explicit user action.
 */

import { useCallback, useEffect, useState } from "react";
import {
  applySuggestion,
  clearJarvisSuggestions,
  dismissSuggestion,
  getJarvisSuggestions,
  getPendingSuggestions,
  setJarvisSuggestions,
  type JarvisSuggestion,
} from "@/lib/jarvis";

export function useJarvis() {
  const [suggestions, setSuggestionsState] = useState<JarvisSuggestion[]>([]);
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
    clearJarvisSuggestions();
    setSuggestionsState([]);
  }, []);

  const setSuggestions = useCallback((next: JarvisSuggestion[]) => {
    setJarvisSuggestions(next);
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
