"use client";

import { Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * JarvisBadge — Visual transparency indicator for all AI-generated outputs.
 *
 * Every Jarvis suggestion, nudge, insight, or recommendation must display
 * this badge so users can immediately distinguish AI-generated content from
 * manually entered data.
 */
export interface JarvisBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

export function JarvisBadge({ size = "sm", className }: JarvisBadgeProps = {}) {
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
    "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]",
    size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
    className,
  );

  return (
    <span className={base} aria-label="Jarvis AI suggestion">
      <Sparkles className="size-3.5 shrink-0" />
      <span>Jarvis AI Suggestion</span>
    </span>
  );
}

/**
 * JarvisShieldBadge — Indicates that a suggestion has been reviewed/applied
 * and is safe (human-in-the-loop confirmed).
 */
export function JarvisShieldBadge({ className }: { className?: string } = {}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        "border-emerald-500/30 bg-emerald-950/20 text-emerald-400",
        className,
      )}
      aria-label="Jarvis applied — human confirmed"
    >
      <ShieldCheck className="size-3.5 shrink-0" />
      <span>Applied</span>
    </span>
  );
}
