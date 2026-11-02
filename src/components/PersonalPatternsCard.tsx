import { Activity, ArrowUpRight, Sparkles } from "lucide-react";

import {
  buildPersonalPatterns,
  type PatternTone,
  type TaskHistoryEntryLike,
} from "@/lib/personal-patterns";
import type { ImpactTier, Task } from "@/lib/mission-store";

const TONE_STYLES: Record<PatternTone, { border: string; chip: string; icon: string }> = {
  emerald: {
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    chip: "border-emerald-500/30 bg-emerald-950/40 text-emerald-400",
    icon: "text-emerald-400",
  },
  amber: {
    border: "border-amber-500/20 hover:border-amber-500/40",
    chip: "border-amber-500/30 bg-amber-950/30 text-amber-400",
    icon: "text-amber-400",
  },
  sky: {
    border: "border-sky-500/20 hover:border-sky-500/40",
    chip: "border-sky-500/30 bg-sky-950/30 text-sky-400",
    icon: "text-sky-400",
  },
};

/**
 * Personal execution pattern card. Reads only the operator's own closure
 * history — never the global leaderboard — so it is safe for corporate users.
 */
export function PersonalPatternsCard({
  taskHistory,
  tasks,
}: {
  taskHistory?: TaskHistoryEntryLike[];
  tasks?: Record<ImpactTier, Task[]>;
}) {
  const patterns = buildPersonalPatterns({ taskHistory, tasks });

  return (
    <section
      aria-label="Personal execution patterns"
      className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 text-left backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.5)] sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-emerald-500/15 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
            <Activity className="size-4 shrink-0 text-emerald-400" />
            Personal Execution Patterns
          </h2>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-500">
            Learned only from your own logged closures. No team or leaderboard data is used.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-950/30 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">
          <Sparkles className="size-3" />
          Private
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {patterns.map((pattern) => {
          const tone = TONE_STYLES[pattern.tone];
          return (
            <article
              key={pattern.id}
              className={`flex min-w-0 flex-col rounded-xl border bg-black/40 p-3.5 transition-colors ${tone.border}`}
            >
              <span
                className={`mb-2 inline-flex w-max items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider ${tone.chip}`}
              >
                <ArrowUpRight className={`size-2.5 ${tone.icon}`} />
                Pattern
              </span>
              <h3 className="text-xs font-black leading-snug text-white">{pattern.title}</h3>
              <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-zinc-400">
                {pattern.detail}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
