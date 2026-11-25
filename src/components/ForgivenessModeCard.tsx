"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getConsecutiveMissedDays,
  markForgivenessOffered,
  shouldShowForgivenessMode,
  type MissionState,
} from "@/lib/streak-monitor";
import { JarvisNudgeCard } from "@/components/JarvisNudge/JarvisNudgeCard";
import { generateChiefOfStaffSuggestions, type ChiefOfStaffContext } from "@/services/jarvis";
import { buildChiefOfStaffContext } from "@/services/jarvis/context-builder";

/**
 * ForgivenessModeCard — Compassionate nudge for users who've missed
 * 3+ consecutive days on their habit streak.
 *
 * Uses JarvisNudgeCard for consistent styling and transparency badging.
 * Offers a gentle "scale back your goal" option with a one-tap action.
 *
 * Human-in-the-loop: the goal adjustment only happens when the user
 * explicitly taps "Scale Back Goal".
 */
export interface ForgivenessModeCardProps {
  state: MissionState;
  userName: string;
  onGoalAdjusted?: () => void;
}

/**
 * Renders the forgiveness mode nudge card when the user has missed
 * FORGIVENESS_THRESHOLD or more consecutive days.
 *
 * Returns null if forgiveness mode is not active.
 */
export function ForgivenessModeCard({ state, userName, onGoalAdjusted }: ForgivenessModeCardProps) {
  const [suggestions, setSuggestions] = useState<Array<{ body: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);

  const consecutiveMissed = getConsecutiveMissedDays(state);
  const shouldShow = shouldShowForgivenessMode(state) && !dismissed && !applied;

  // Generate AI Chief of Staff suggestions for the forgiveness context
  useEffect(() => {
    if (!shouldShow || loading || suggestions.length > 0) return;

    const context: ChiefOfStaffContext = buildChiefOfStaffContext({
      mission: state.mission ?? null,
      tasks: {
        high: (state.tasks?.high ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
        medium: (state.tasks?.medium ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
        low: (state.tasks?.low ?? []).map((t) => ({
          id: t.id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: t.text,
          done: t.done,
        })),
      },
      daily: state.daily ?? { text: "", done: false, date: "" },
      streak: state.streak ?? { count: 0, lastCompletedDate: null },
      userName,
    });

    setLoading(true);
    generateChiefOfStaffSuggestions(context).then((result) => {
      setSuggestions(result);
      setLoading(false);
      markForgivenessOffered();
    });
  }, [state, userName, shouldShow, loading, suggestions.length]);

  if (!shouldShow) return null;

  const missedDays = consecutiveMissed;
  const suggestionText =
    suggestions[0]?.body ||
    "Consider scaling back your goals this week to make them more achievable.";

  const handleApply = () => {
    setApplied(true);
    markForgivenessOffered();
    onGoalAdjusted?.();
  };

  const handleDismiss = () => {
    setDismissed(true);
    markForgivenessOffered();
  };

  return (
    <JarvisNudgeCard
      id="forgiveness-mode"
      title="Missed a few days? That's okay."
      body={
        missedDays === 1
          ? "You missed yesterday. No sweat — everyone has off days."
          : `You've missed ${missedDays} days in a row. Be kind to yourself. Progress isn't linear, and coming back is what matters.`
      }
      rationale={`Your streak is currently at ${state.streak?.count ?? 0}. AI Chief of Staff noticed you haven't completed your daily action for ${missedDays} consecutive day${missedDays === 1 ? "" : "s"}.`}
      suggestedAction="Scale back your weekly goal so you can ease back in without pressure."
      confidence={85}
      onApply={handleApply}
      onDismiss={handleDismiss}
      applied={applied}
    >
      {/* The card's built-in Apply/Dismiss buttons handle the actions */}
    </JarvisNudgeCard>
  );
}