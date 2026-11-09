import { ArrowRight, Bot, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { type DayPlanProposal } from "@/lib/daily-plan";
import { describeRollover, type RolloverSummary } from "@/lib/mission-store";

/**
 * Explains how today's matrix was assembled from yesterday's unfinished
 * priorities, and lets the operator re-run the AI refinement on demand.
 */
export function DayPlanBriefing({
  rollover,
  plan,
  loading,
  onRefine,
  onFocusAction,
  disabled = false,
}: {
  rollover: RolloverSummary | null;
  plan: DayPlanProposal | null;
  loading: boolean;
  onRefine: () => void;
  onFocusAction: () => void;
  disabled?: boolean;
}) {
  if (!rollover && !plan) return null;

  const carriedTotal = rollover?.total ?? 0;
  const source = plan?.source === "ai" ? "AI refined" : "Local planner";
  const rationale = plan?.rationale ?? describeRollover(rollover);

  return (
    <section
      aria-label="Today's AI plan"
      className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#0D0D11]/80 p-4 text-left backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] sm:p-5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-emerald-400">
            Daily Rollover
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white">
            <Sparkles className="size-4 shrink-0 text-emerald-400" />
            Today&apos;s Execution Plan
          </h2>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Bot className="size-3" />}
          {loading ? "Planning" : source}
        </span>
      </div>

      {rollover && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <CarriedPill label="High" value={rollover.high} tone="rose" />
          <CarriedPill label="Medium" value={rollover.medium} tone="amber" />
          <CarriedPill label="Low" value={rollover.low} tone="sky" />
        </div>
      )}

      <p className="mt-3 text-[11px] font-medium leading-relaxed text-zinc-400">
        {rollover
          ? describeRollover(rollover)
          : `${carriedTotal === 0 ? "No unfinished priorities were carried into today." : "Today's plan is ready."}`}
      </p>

      {plan && (
        <>
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-black/50 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400/80">
                  Master Focus Action
                </p>
                <p className="mt-1 text-sm font-bold leading-snug text-white">
                  {plan.dailyAction || "Set today's highest-impact objective."}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] font-medium leading-relaxed text-zinc-500">
            {rationale}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onFocusAction}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500 text-[11px] font-black uppercase tracking-wider text-black transition-all hover:bg-emerald-400 active:scale-[0.99]"
            >
              Execute the focus action
              <ArrowRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefine}
              disabled={loading || disabled}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-3 text-[11px] font-bold text-emerald-300 transition-all hover:border-emerald-500/50 hover:bg-emerald-950/50 disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refine with AI
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CarriedPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "sky";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-500/25 bg-rose-950/20 text-rose-300"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-950/20 text-amber-300"
        : "border-sky-500/25 bg-sky-950/20 text-sky-300";

  return (
    <div className={`rounded-xl border px-2.5 py-2 text-center ${toneClass}`}>
      <p className="font-mono text-lg font-black tabular-nums leading-none">{value}</p>
      <p className="mt-1 font-mono text-[8px] font-black uppercase tracking-wider opacity-80">
        {label}
      </p>
    </div>
  );
}
