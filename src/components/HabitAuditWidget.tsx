"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeWeeklyStats,
  generateWeeklyHabitAudit,
  hasWeeklyAuditThisWeek,
  isSunday,
  type WeeklyStats,
} from "@/lib/habit-audit";
import type { MissionState } from "@/lib/mission-store";
import { JarvisNudgeCard } from "@/components/JarvisNudge/JarvisNudgeCard";

/**
 * HabitAuditWidget — Weekly progress audit card.
 *
 * Appears on Sunday evenings (or when a cached audit exists) to show the
 * operator an AI Chief of Staff-generated recap of their week: completion rate, streak,
 * best/worst days, and AI-generated recommendations.
 *
 * Human-in-the-loop: suggestions from the audit can be applied or dismissed
 * individually, just like any other AI Chief of Staff nudge.
 */
export interface HabitAuditWidgetProps {
  state: MissionState;
  userName: string;
}

/**
 * Renders the weekly habit audit card.
 *
 * On first Sunday-evening visit, triggers AI Chief of Staff to generate a weekly recap.
 * Cached audits are shown on subsequent visits until the next week.
 */
export function HabitAuditWidget({ state, userName }: HabitAuditWidgetProps) {
  const [auditText, setAuditText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Compute stats immediately (synchronous)
  const stats = useMemo(() => computeWeeklyStats(state), [state]);

  // Trigger audit generation on Sunday if not already done this week
  useEffect(() => {
    if (!isSunday() || hasWeeklyAuditThisWeek() || generated) return;

    setLoading(true);
    generateWeeklyHabitAudit(state).then((text) => {
      setAuditText(text);
      setGenerated(true);
      setLoading(false);
    });
  }, [state, generated]);

  const hasData = stats.totalTasks > 0 || stats.streakCount > 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left backdrop-blur-xl shadow-lg">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-400">
            <Clock className="size-3 shrink-0" />
            Habit Audit — Weekly Recap
          </h3>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-500">
            AI Chief of Staff-generated summary of your week
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider",
            loading
              ? "border-amber-500/30 bg-amber-950/20 text-amber-400 animate-pulse"
              : "border-zinc-700/30 bg-zinc-950/20 text-zinc-400",
          )}
        >
          {loading ? (
            <Sparkles className="size-3 shrink-0 animate-pulse" />
          ) : (
            <Sparkles className="size-3 shrink-0" />
          )}
          Weekly
        </span>
      </div>

      {/* Stats row */}
      <div className="grid gap-2 sm:grid-cols-4 mb-4">
        <StatCard label="Completed" value={`${stats.completedTasks}/${stats.totalTasks}`} />
        <StatCard label="Rate" value={`${stats.completionRate}%`} />
        <StatCard
          label="Streak"
          value={`${stats.streakCount} day${stats.streakCount === 1 ? "" : "s"}`}
        />
        <StatCard label="Best Day" value={stats.bestDay || "—"} />
      </div>

      {/* Audit text from AI Chief of Staff */}
      {auditText && (
        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3 shrink-0 text-emerald-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70">
              AI Chief of Staff Weekly Recap
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {auditText}
          </p>
        </div>
      )}

      {/* Stats-only fallback when no AI audit yet */}
      {!auditText && hasData && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500/70 mb-1">
            Weekly Summary
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-300">
            You completed {stats.completedTasks} of {stats.totalTasks} tasks this week (
            {stats.completionRate}%). Your streak is {stats.streakCount} day$
            {stats.streakCount === 1 ? "" : "s"}. AI Chief of Staff will generate a full weekly recap on Sunday
            evenings.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!hasData && !auditText && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500/70 mb-1">
            No data yet
          </p>
          <p className="text-[11px] text-zinc-500">
            Complete some tasks and AI Chief of Staff will generate your weekly audit.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Small stat card for the weekly audit header.
 */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500/70">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-white">{value}</p>
    </div>
  );
}