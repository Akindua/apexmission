/**
 * Streak Monitor — Detects consecutive missed days for habit forgiveness.
 *
 * When a user misses 3 or more consecutive days on their habit streak,
 * this utility flags the account for a compassionate "Forgiveness Mode"
 * nudge that offers to scale back goals.
 */

import { todayKey, type MissionState } from "@/lib/mission-store";
import { getScopedItem, removeScopedItem, setScopedItem } from "@/lib/user-storage";

export type { MissionState } from "@/lib/mission-store";

/**
 * The number of consecutive missed days that triggers forgiveness mode.
 */
export const FORGIVENESS_THRESHOLD = 3;

/**
 * Storage key for tracking when forgiveness mode was last offered/dismissed.
 */
const FORGIVENESS_OFFERED_KEY = "forgiveness-mode-offered";

/**
 * Get the date key for N days ago in the user's local timezone.
 */
function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/\//g, "-");
}

/**
 * Check whether forgiveness mode should be shown to the user.
 *
 * Returns true when the user has missed FORGIVENESS_THRESHOLD or more
 * consecutive days AND hasn't already been offered forgiveness this week.
 */
export function shouldShowForgivenessMode(state: MissionState): boolean {
  const consecutiveMissed = getConsecutiveMissedDays(state);
  if (consecutiveMissed < FORGIVENESS_THRESHOLD) return false;

  // Don't re-offer if already offered this week
  if (hasForgivenessBeenOfferedThisWeek()) return false;

  return true;
}

/**
 * Count consecutive days with no task completion, counting backward from
 * yesterday. A day is "missed" if no task was completed.
 */
export function getConsecutiveMissedDays(state: MissionState): number {
  const today = todayKey();
  const yesterday = daysAgoKey(1);

  // If today's daily action is done, we're not in a missed streak
  if (state.daily?.done) return 0;

  let missed = 0;
  let checkDate = yesterday;

  while (true) {
    const dayCompleted = checkDailyCompletion(state, checkDate);

    if (!dayCompleted) {
      missed += 1;
      const d = new Date(checkDate);
      d.setDate(d.getDate() - 1);
      checkDate = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(d)
        .replace(/\//g, "-");
    } else {
      break;
    }

    if (missed > 30) break;
  }

  return missed;
}

/**
 * Check if a specific date had any task completion.
 * Looks at the streak's lastCompletedDate and reflection history.
 */
function checkDailyCompletion(state: MissionState, date: string): boolean {
  if (state.streak?.lastCompletedDate === date) return true;
  return (
    state.reflectionHistory?.some(
      (entry) => entry.date === date && entry.actionCompleted === true,
    ) ?? false
  );
}

/**
 * Check if forgiveness mode has already been offered this week.
 */
function hasForgivenessBeenOfferedThisWeek(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const lastOffered = getScopedItem(FORGIVENESS_OFFERED_KEY);
    if (!lastOffered) return false;
    const lastDate = new Date(lastOffered);
    const today = new Date();
    return (
      lastDate.getFullYear() === today.getFullYear() &&
      Math.floor(
        (lastDate.getTime() - new Date(lastDate.getFullYear(), 0, 1).getTime()) / 86400000 / 7,
      ) ===
        Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000 / 7)
    );
  } catch {
    return false;
  }
}

/**
 * Mark that forgiveness mode has been offered this week.
 * Prevents re-showing the nudge until next week.
 */
export function markForgivenessOffered(): void {
  if (typeof window === "undefined") return;
  try {
    setScopedItem(FORGIVENESS_OFFERED_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable — non-fatal
  }
}

/**
 * Clear the forgiveness offered flag (e.g., after user applies the suggestion).
 */
export function clearForgivenessOffered(): void {
  if (typeof window === "undefined") return;
  try {
    removeScopedItem(FORGIVENESS_OFFERED_KEY);
  } catch {
    // Storage unavailable — non-fatal
  }
}
