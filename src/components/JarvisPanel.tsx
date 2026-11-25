"use client";

import { ArrowLeft, Loader2, Sparkles, X, Zap, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { handleUnauthenticated } from "@/lib/api-auth";
import { getChiefOfStaffSuggestions, getPendingSuggestions } from "@/services/jarvis";
import type { ChiefOfStaffSuggestion as ChiefOfStaffSuggestionType } from "@/services/jarvis";
import { JarvisBadge } from "@/components/JarvisNudge/JarvisBadge";
import { JarvisSuggestion } from "@/components/JarvisNudge/JarvisSuggestion";
import { type ImpactTier, type Task } from "@/lib/mission-store";

/**
 * ChiefOfStaffPanel — The AI Chief of Staff side panel.
 *
 * Displays pending AI suggestions (nudges, workflow, schedule) with
 * Apply/Dismiss controls. Every suggestion is AI-generated and clearly
 * badged. Standard features are available to all authenticated users.
 * Enterprise advanced features require an active enterprise subscription.
 *
 * Human-in-the-loop: no suggestion is applied without an explicit user tap.
 */
export interface ChiefOfStaffPanelProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  mission: string | null;
  tasks: Record<ImpactTier, Task[]>;
  daily: { text: string; done: boolean };
  streak: { count: number };
}

export function ChiefOfStaffPanel({
  open,
  onClose,
  userName,
  mission,
  tasks,
  daily,
  streak,
}: ChiefOfStaffPanelProps) {
  const { tier, enterprise, loading: subscriptionLoading } = useSubscriptionTier();
  const navigate = useNavigate();
  const [suggestions, setSuggestionsState] = useState<ChiefOfStaffSuggestionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showEnterpriseGate, setShowEnterpriseGate] = useState(false);

  // Standard features available to all authenticated users
  const isEntitled = !subscriptionLoading;
  const isEnterpriseEntitled = enterprise && !subscriptionLoading;

  // Load pending suggestions on open
  useEffect(() => {
    if (!open) return;
    setSuggestionsState(getPendingSuggestions());
  }, [open]);

  // Generate new suggestions via the server API
  const generateSuggestions = useCallback(async (requestEnterprise = false) => {
    if (generating || !isEntitled) return;
    if (requestEnterprise && !isEnterpriseEntitled) {
      setShowEnterpriseGate(true);
      return;
    }

    setGenerating(true);
    setError(null);
    setShowEnterpriseGate(false);

    try {
      const context = {
        firstName: userName.split(" ")[0],
        mission,
        highTasks: (tasks["high"] ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
        mediumTasks: (tasks["medium"] ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
        lowTasks: (tasks["low"] ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
        dailyAction: daily.text || null,
        dailyDone: daily.done,
        streakCount: streak.count,
        enterprise: requestEnterprise,
      };

      const response = await fetch("/api/chief-of-staff/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ context }),
      });

      if (!response.ok) {
        if (handleUnauthenticated(response)) return;
        if (response.status === 403) {
          if (requestEnterprise) {
            setShowEnterpriseGate(true);
          } else {
            setError("AI Chief of Staff is temporarily unavailable.");
          }
        } else {
          setError("AI Chief of Staff is temporarily unavailable.");
        }
        return;
      }

      const data = await response.json();
      const newSuggestions: ChiefOfStaffSuggestionType[] = (data.suggestions ?? []).map((s: any) => ({
        ...s,
        status: "pending" as const,
        createdAt: s.createdAt || new Date().toISOString(),
      }));

      // Merge with existing pending suggestions (avoid duplicates by title)
      const existing = getPendingSuggestions();
      const existingTitles = new Set(existing.map((s) => s.title));
      const uniqueNew = newSuggestions.filter((s) => !existingTitles.has(s.title));

      const combined = [...existing, ...uniqueNew];
      setSuggestionsState(combined);
      setGenerating(false);
    } catch {
      setError("AI Chief of Staff is temporarily unavailable.");
      setGenerating(false);
    }
  }, [generating, isEntitled, userName, mission, tasks, daily, streak]);

  // Generate on mount if panel opens and we have no suggestions yet
  useEffect(() => {
    if (open && suggestions.length === 0 && isEntitled) {
      generateSuggestions(false);
    }
  }, [open, suggestions.length, isEntitled, generateSuggestions]);

  const handleApply = useCallback((suggestion: ChiefOfStaffSuggestionType) => {
    setSuggestionsState((prev) =>
      prev.map((s) => (s.id === suggestion.id ? { ...s, status: "applied" } : s)),
    );
  }, []);

  const handleDismiss = useCallback((suggestion: ChiefOfStaffSuggestionType) => {
    setSuggestionsState((prev) =>
      prev.map((s) => (s.id === suggestion.id ? { ...s, status: "dismissed" } : s)),
    );
  }, []);

  if (!open) return null;

  // Enterprise gate for advanced features
  if (showEnterpriseGate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 py-6">
        <button
          type="button"
          onClick={() => setShowEnterpriseGate(false)}
          className="absolute inset-0 animate-in fade-in bg-background/80 backdrop-blur-sm duration-300"
        />
        <div className="relative z-10 my-auto max-h-[calc(100dvh-3rem)] w-full max-w-md animate-in fade-in zoom-in-95 overflow-y-auto p-5 duration-300 sm:p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="flex size-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-950/40 text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
              <Lock className="size-5" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Enterprise AI Chief of Staff Features</h2>
          </div>

          <JarvisBadge size="md" className="mb-4" />

          <p className="text-[11px] leading-relaxed text-zinc-400 mb-6">
            Advanced enterprise features require an active enterprise subscription ($50/month).
            Standard features remain available to all users.
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setShowEnterpriseGate(false);
                navigate({ to: "/workspace-billing", search: { company: "upgrade" } });
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-[11px] font-bold text-black shadow-[0_0_20px_rgba(56,189,248,0.3)] transition-all hover:bg-sky-400 active:scale-95"
            >
              <Zap className="size-4 shrink-0" />
              Upgrade to Enterprise
            </button>
            <button
              type="button"
              onClick={() => setShowEnterpriseGate(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-[11px] font-bold text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="size-4 shrink-0" />
              Continue with Standard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pending = suggestions.filter((s) => s.status === "pending");

  return (
    <div className="fixed inset-y-0 right-0 z-50 h-full w-full md:w-[420px] bg-zinc-950 border-l border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close AI Chief of Staff panel"
      />

      {/* Panel content */}
      <div className="relative z-10 h-full flex flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h2 className="font-black text-white tracking-tight">AI Chief of Staff</h2>
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/70">
                Personal Copilot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {enterprise && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400">
                Enterprise
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); generateSuggestions(true); }}
              disabled={generating || !isEnterpriseEntitled}
              className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-950/30 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-sky-400 transition-all hover:border-sky-500/50 hover:bg-sky-500 hover:text-black disabled:opacity-50"
              title={isEnterpriseEntitled ? "Generate enterprise suggestions" : "Requires enterprise subscription"}
            >
              <Zap className="size-3.5 text-sky-400" />
              <span>Enterprise</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Chief of Staff"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 mb-3">
                <Sparkles className="size-6 text-zinc-600" />
              </div>
              <h3 className="text-sm font-bold text-white">No suggestions yet</h3>
              <p className="mt-1 text-[10px] text-zinc-500 max-w-xs">
                AI Chief of Staff will analyze your mission, tasks, and streak to generate proactive nudges and
                workflow recommendations.
              </p>
              <button
                type="button"
                onClick={() => generateSuggestions(false)}
                disabled={generating}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin shrink-0" />
                ) : (
                  <Zap className="size-3.5 shrink-0" />
                )}
                {generating ? "Generating…" : "Generate Suggestions"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70">
                  Pending Suggestions ({pending.length})
                </h3>
                <button
                  type="button"
                  onClick={() => generateSuggestions(false)}
                  disabled={generating}
                  className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <Zap className="size-3 shrink-0" />
                  Refresh
                </button>
              </div>

              {pending.map((suggestion) => (
                <JarvisSuggestion
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApply={handleApply}
                  onDismiss={handleDismiss}
                />
              ))}

              {error && (
                <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3">
                  <p className="text-[10px] font-bold text-rose-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-4">
          <p className="text-[9px] font-medium text-zinc-500">
            AI Chief of Staff suggestions require your explicit approval before any change is made to your
            mission or tasks.
          </p>
        </div>
      </div>
    </div>
  );
}