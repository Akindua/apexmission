"use client";

import { ArrowRight, ShieldAlert, X, Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * JarvisNudgeCard — Proactive AI insight card.
 *
 * Displays a Jarvis AI suggestion with a distinct transparency badge,
 * contextual body text, and two explicit touch targets: Dismiss and Apply
 * Changes. Every interaction requires explicit user consent — the card never
 * applies changes autonomously.
 *
 * Styled with Tailwind CSS for dark-mode compatibility, matching the
 * ApexMission emerald/zinc design system.
 */
export interface JarvisNudgeCardProps {
  /** Unique identifier for the nudge. */
  id: string;
  /** Title of the suggestion. */
  title: string;
  /** Contextual body text describing the recommendation. */
  body: string;
  /** Optional short rationale explaining why this was suggested. */
  rationale?: string;
  /** Human-readable description of what applying does. */
  suggestedAction?: string;
  /** Callback executed when the user taps "Apply Changes". */
  onApply: (id: string) => void;
  /** Callback executed when the user taps "Dismiss". */
  onDismiss: (id: string) => void;
  /** Optional confidence score (0–100) shown as a subtle indicator. */
  confidence?: number;
  /** When true, shows an applied/locked state instead of action buttons. */
  applied?: boolean;
}

export function JarvisNudgeCard({
  id,
  title,
  body,
  rationale,
  suggestedAction,
  onApply,
  onDismiss,
  confidence,
  applied = false,
}: JarvisNudgeCardProps) {
  const [state, setState] = useState<"idle" | "applying" | "dismissing">("idle");

  const handleApply = async () => {
    setState("applying");
    try {
      onApply(id);
    } finally {
      setState("idle");
    }
  };

  const handleDismiss = async () => {
    setState("dismissing");
    try {
      onDismiss(id);
    } finally {
      setState("idle");
    }
  };

  const isProcessing = state === "applying" || state === "dismissing";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4 text-left backdrop-blur-xl transition-colors duration-300",
        applied
          ? "border-emerald-500/30 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
          : "border-zinc-800/30 bg-zinc-900/50 hover:border-zinc-700/50"
      )}
    >
      {/* Header: transparency badge + type chip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0 text-emerald-400/70" />
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
            "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
          )}>
            <Zap className="size-3 shrink-0" />
            ✨ Jarvis AI Suggestion
          </span>
        </div>

        {confidence !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider",
            "border-zinc-700/30 bg-zinc-900/30 text-zinc-400"
          )}>
            <span className="flex h-1 w-1 rounded-full bg-zinc-500" />
            {Math.round(confidence)}% match
          </span>
        )}
      </div>

      <h3 className="text-sm font-bold text-white leading-snug">{title}</h3>

      <p className="mt-1 leading-relaxed text-zinc-300">{body}</p>

      {rationale && (
        <div className="mt-3 pt-3 border-t border-zinc-800/50">
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500/70">
            Why Jarvis suggests this
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">
            {rationale}
          </p>
        </div>
      )}

      {suggestedAction && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 border-zinc-800/50 bg-zinc-900/30">
            <ArrowRight className="size-2.5 shrink-0" />
            {suggestedAction}
          </span>
        </div>
      )}

      {/* Action row */}
      <div className="mt-4 flex items-center justify-between gap-2">
        {applied ? (
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider",
            "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
          )}>
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Applied
          </span>
        ) : (
          <div className="flex gap-2 flex-1">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isProcessing}
              aria-label={`Dismiss suggestion ${id}`}
              className={cn(
                "flex items-center justify-center gap-2 flex-1 rounded-xl border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-400 transition-colors",
                "hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:pointer-events-none",
                isProcessing && "animate-pulse"
              )}
            >
              {isProcessing ? (
                <X className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <X className="size-3.5 shrink-0" />
              )}
              <span>Dismiss</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isProcessing}
              aria-label={`Apply changes for suggestion ${id}`}
              className={cn(
                "flex items-center justify-center gap-2 flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all",
                "hover:bg-emerald-400 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                isProcessing && "animate-pulse"
              )}
            >
              {isProcessing ? (
                <Zap className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <Zap className="size-3.5 shrink-0" />
              )}
              <span>Apply Changes</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
