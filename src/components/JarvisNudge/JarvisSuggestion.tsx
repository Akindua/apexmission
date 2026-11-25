"use client";

import { ArrowRight, Check, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  applySuggestion,
  dismissSuggestion,
  type ChiefOfStaffSuggestion,
  type ChiefOfStaffSuggestionType,
} from "@/services/jarvis";
import { JarvisBadge, JarvisShieldBadge } from "./JarvisBadge";

/**
 * JarvisSuggestion — A single AI-generated suggestion card.
 *
 * Human-in-the-loop: the suggestion is only applied when the user explicitly
 * taps "Apply". Tapping "Dismiss" removes it from the pending queue without
 * making any changes to user data.
 */
export interface JarvisSuggestionProps {
  suggestion: ChiefOfStaffSuggestion;
  onApply?: (suggestion: ChiefOfStaffSuggestion) => void;
  onDismiss?: (suggestion: ChiefOfStaffSuggestion) => void;
}

export function JarvisSuggestion({ suggestion, onApply, onDismiss }: JarvisSuggestionProps) {
  const [state, setState] = useState<"idle" | "applying" | "dismissing">("idle");

  const handleApply = async () => {
    setState("applying");
    try {
      applySuggestion(suggestion.id);
      onApply?.(suggestion);
    } finally {
      setState("idle");
    }
  };

  const handleDismiss = async () => {
    setState("dismissing");
    try {
      dismissSuggestion(suggestion.id);
      onDismiss?.(suggestion);
    } finally {
      setState("idle");
    }
  };

  const typeLabels: Record<ChiefOfStaffSuggestionType, { label: string; icon: React.ReactNode }> = {
    nudge: { label: "Nudge", icon: <ArrowRight className="size-4 shrink-0" /> },
    workflow: {
      label: "Workflow",
      icon: <Check className="size-4 shrink-0" />,
    },
    schedule: { label: "Schedule", icon: <X className="size-4 shrink-0" /> },
  };

  const typeInfo = typeLabels[suggestion.type] ?? typeLabels.nudge;
  const isPending = suggestion.status === "pending";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4 text-left backdrop-blur-xl transition-colors duration-300",
        isPending
          ? "border-emerald-500/25 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
          : "border-zinc-800/30 bg-zinc-900/50",
      )}
    >
      {/* Header: type badge + AI transparency badge + status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
            )}
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {typeInfo.label}
          </span>
          <JarvisBadge size="sm" />
        </div>
        {suggestion.status === "applied" && <JarvisShieldBadge />}
        {suggestion.status === "dismissed" && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              "border-zinc-600/30 bg-zinc-900/30 text-zinc-500",
            )}
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Dismissed
          </span>
        )}
      </div>

      <h3 className="text-sm font-bold text-white leading-snug">{suggestion.title}</h3>

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{suggestion.body}</p>

      {suggestion.rationale && (
        <div className="mt-2 pt-2 border-t border-emerald-500/10">
          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/70">
            Why AI Chief of Staff suggests this
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{suggestion.rationale}</p>
        </div>
      )}

      {/* Action row: Apply / Dismiss */}
      <div className="mt-4 flex items-center justify-between gap-2">
        {isPending ? (
          <button
            type="button"
            onClick={handleApply}
            disabled={state === "applying"}
            aria-label={`Apply suggestion: ${suggestion.title}`}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all",
              "hover:bg-emerald-400 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
              state === "applying" && "animate-pulse",
            )}
          >
            {state === "applying" ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" />
            ) : (
              <Check className="size-3.5 shrink-0" />
            )}
            <span>Apply</span>
          </button>
        ) : (
          <JarvisShieldBadge />
        )}
        {isPending ? (
          <button
            type="button"
            onClick={handleDismiss}
            disabled={state === "dismissing"}
            aria-label={`Dismiss suggestion: ${suggestion.title}`}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-400 transition-colors",
              "hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:pointer-events-none",
              state === "dismissing" && "animate-pulse",
            )}
          >
            {state === "dismissing" ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" />
            ) : (
              <X className="size-3.5 shrink-0" />
            )}
            <span>Dismiss</span>
          </button>
        ) : null}
      </div>

      {/* Meta: suggested action + confidence */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
          {suggestion.suggestedAction}
        </span>
        {suggestion.confidence !== undefined && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400/70">
            <span className="flex h-1 w-1 rounded-full bg-emerald-400" />
            {Math.round(suggestion.confidence)}% match
          </span>
        )}
      </div>
    </article>
  );
}