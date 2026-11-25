"use client";

import { Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { chiefOfStaffBadgeBase, chiefOfStaffBadgeSm, chiefOfStaffBadgeMd, chiefOfStaffShieldBadgeBase } from "./styles";

/**
 * JarvisBadge — Visual transparency indicator for all AI-generated outputs.
 *
 * Every AI Chief of Staff suggestion, nudge, insight, or recommendation must display
 * this badge so users can immediately distinguish AI-generated content from
 * manually entered data.
 */
export interface JarvisBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

export function JarvisBadge({ size = "sm", className }: JarvisBadgeProps = {}) {
  const base = cn(chiefOfStaffBadgeBase, size === "sm" ? chiefOfStaffBadgeSm : chiefOfStaffBadgeMd, className);

  return (
    <span className={base} aria-label="AI Chief of Staff suggestion">
      <Sparkles className="size-3.5 shrink-0" />
      <span>AI Chief of Staff Suggestion</span>
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
      className={cn(chiefOfStaffShieldBadgeBase, className)}
      aria-label="AI Chief of Staff applied — human confirmed"
    >
      <ShieldCheck className="size-3.5 shrink-0" />
      <span>Applied</span>
    </span>
  );
}