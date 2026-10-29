import { createFileRoute } from "@tanstack/react-router";
import { Activity, CheckCircle2, Flame, ShieldCheck, Users, Zap } from "lucide-react";

import { getDemoShowcase, type DemoShowcase } from "@/lib/demo.functions";

const DEFAULT_TIER_STYLE = {
  label: "LOW IMPACT",
  dot: "bg-sky-500",
  badge: "text-sky-400 border-sky-500/30 bg-sky-950/30",
};

const TIER_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  high: {
    label: "HIGH IMPACT",
    dot: "bg-rose-500",
    badge: "text-rose-400 border-rose-500/30 bg-rose-950/30",
  },
  medium: {
    label: "MEDIUM IMPACT",
    dot: "bg-amber-500",
    badge: "text-amber-400 border-amber-500/30 bg-amber-950/30",
  },
  low: {
    label: "LOW IMPACT",
    dot: "bg-sky-500",
    badge: "text-sky-400 border-sky-500/30 bg-sky-950/30",
  },
};

export const Route = createFileRoute("/demo")({
  // Server-side load: the grid arrives fully rendered in the HTML payload.
  loader: () => getDemoShowcase(),
  head: () => ({
    meta: [
      { title: "ApexMission — Live Team Grid (Demo)" },
      {
        name: "description",
        content: "Live demonstration of the ApexMission enterprise execution dashboard.",
      },
      // Demo tenant data must never be indexed or harvested.
      { name: "robots", content: "noindex, nofollow, noai" },
      { name: "copyright", content: "© 2026 ApexMissions. All rights reserved." },
    ],
  }),
  component: DemoShowcasePage,
});

function DemoShowcasePage() {
  const showcase: DemoShowcase | null = Route.useLoaderData();

  if (!showcase) {
    return (
      <div className="page-shell flex min-h-dvh items-center justify-center px-6">
        <div className="glass-panel max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 size-10 text-emerald-400" />
          <h1 className="text-xl font-black uppercase text-white">Demo Dataset Not Seeded</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            The showcase tenant (slug <span className="font-mono text-emerald-400">demo</span>) was
            not found in the database. Run the{" "}
            <span className="font-mono text-emerald-400">20261029150000_showcase_demo_seed</span>{" "}
            migration, then reload.
          </p>
        </div>
      </div>
    );
  }

  const completedCount = showcase.tasks.length;

  return (
    <div className="page-shell min-h-dvh px-4 py-8 sm:px-6 lg:px-10">
      <div className="ambient-emerald-glow" />
      <div className="grid-pattern-overlay" />

      <div className="relative mx-auto w-full max-w-6xl">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="glass-panel mb-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live Demo
                </span>
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                  {showcase.slug}.apexmissions.app
                </span>
              </div>
              <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
                {showcase.companyName}
              </h1>
              <p className="mt-1.5 text-xs font-medium text-zinc-500">
                Enterprise Execution Grid — seeded demo workspace for live pitch walkthroughs.
              </p>
            </div>

            <div className="text-right">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                Team Invite Code
              </p>
              <p className="mt-1 rounded-lg border border-emerald-500/30 bg-black/50 px-4 py-2 font-mono text-lg font-black tracking-[0.15em] text-emerald-400">
                {showcase.inviteCode}
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatCard
              icon={<Users className="size-4" />}
              label="Operators"
              value={String(showcase.operators.length)}
            />
            <StatCard
              icon={<CheckCircle2 className="size-4" />}
              label="Tasks Completed Today"
              value={String(completedCount)}
            />
            <StatCard
              icon={<Flame className="size-4" />}
              label="Best Streak"
              value={`${Math.max(0, ...showcase.operators.map((op) => op.streak))} days`}
            />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Operator grid ─────────────────────────────────────── */}
          <section className="glass-panel p-6 lg:col-span-3">
            <SectionTitle icon={<Users className="size-4" />} title="Operator Status Board" />
            <div className="mt-4 space-y-3">
              {showcase.operators.map((operator, index) => (
                <div
                  key={operator.id}
                  className="group flex items-center gap-4 rounded-xl border border-zinc-800/70 bg-black/40 p-4 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                >
                  <span className="w-6 text-center font-mono text-xs font-black text-zinc-600">
                    #{index + 1}
                  </span>
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 font-mono text-sm font-black text-emerald-400">
                    {operator.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{operator.name}</p>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                      {operator.completedToday} task{operator.completedToday === 1 ? "" : "s"}{" "}
                      completed today
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="font-mono text-sm font-black tabular-nums text-emerald-400">
                      {operator.credits.toLocaleString()}
                    </p>
                    <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                      credits
                    </p>
                  </div>
                  <div className="hidden text-right md:block">
                    <p className="font-mono text-sm font-black tabular-nums text-white">
                      {operator.streak}
                      <span className="ml-0.5 text-[10px] text-zinc-600">d</span>
                    </p>
                    <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                      streak
                    </p>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider ${
                      operator.status === "OPERATIONAL"
                        ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                        : "border-zinc-700 bg-zinc-900/60 text-zinc-500"
                    }`}
                  >
                    {operator.status}
                  </span>
                </div>
              ))}
              {showcase.operators.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-600">No operators seeded yet.</p>
              )}
            </div>
          </section>

          {/* ── Completed tasks ───────────────────────────────────── */}
          <section className="glass-panel p-6 lg:col-span-2">
            <SectionTitle icon={<Activity className="size-4" />} title="Today's Execution Log" />
            <div className="mt-4 space-y-3">
              {showcase.tasks.map((task) => {
                const style = TIER_STYLES[task.tier] ?? DEFAULT_TIER_STYLE;
                const time = new Date(task.completedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-zinc-800/70 bg-black/40 p-3.5 transition-colors hover:border-emerald-500/30"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider ${style.badge}`}
                      >
                        <span className={`size-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold text-emerald-500">
                        <CheckCircle2 className="size-3" />
                        {time}
                      </span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-zinc-300">
                      {task.text}
                    </p>
                  </div>
                );
              })}
              {showcase.tasks.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-600">No tasks seeded yet.</p>
              )}
            </div>
          </section>
        </div>

        {/* ── CTA ────────────────────────────────────────────────── */}
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-[#060D08] to-black p-6">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
              <Zap className="size-3.5" /> This is a live ApexMission workspace
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Real database, real tenant isolation, zero AI credits spent on this page.
            </p>
          </div>
          <a
            href="/auth?mode=signup"
            className="inline-flex h-11 items-center rounded-xl bg-emerald-500 px-6 font-mono text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-95"
          >
            Launch Your Own Workspace →
          </a>
        </footer>

        <p className="mt-6 text-center font-mono text-[9px] font-black uppercase tracking-[0.2em] text-zinc-700">
          © 2026 ApexMissions. All rights reserved. Demo data is synthetic.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-black/40 p-4 text-center">
      <span className="mx-auto mb-1.5 flex size-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-950/40 text-emerald-400">
        {icon}
      </span>
      <p className="font-mono text-lg font-black tabular-nums text-white">{value}</p>
      <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-600">
        {label}
      </p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 font-mono text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">
      {icon}
      {title}
    </h2>
  );
}
