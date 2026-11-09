import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  buildWeeklySummary,
  fetchCompanyExecutionAnalytics,
  type EnterpriseAnalytics,
  type EnterpriseOperator,
  type EnterpriseTotals,
} from "@/lib/enterprise-analytics";
import { TENANT_ROOT_DOMAIN } from "@/lib/tenant-host";

function formatDayLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey.slice(5);
  return parsed.toLocaleDateString("en-US", { weekday: "narrow" });
}

function formatFullDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeLastClose(iso: string | null): string {
  if (!iso) return "No record";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "No record";
  const days = Math.floor((Date.now() - parsed.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * Manager-facing execution analytics for the caller's own company.
 * Fetches through a company-scoped SECURITY DEFINER RPC; it never reads the
 * global leaderboard.
 *
 * PRIVACY-ALIGNED: Shows only what employees explicitly logged:
 * - completed tasks per person (with text, tier, date)
 * - week-over-week completed count
 * - carried-over tasks (from current_plan high tier)
 * - blockers they entered (from current_plan high tier, not done)
 * NO credits, streaks, failure_count, velocity_score, operational_status,
 * FALLEN status, "streak leader", "at-risk operators", or gamification.
 */
export function EnterpriseAnalyticsPanel({
  companyNameFallback = null,
}: {
  companyNameFallback?: string | null;
}) {
  const [analytics, setAnalytics] = useState<EnterpriseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async (active: { value: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCompanyExecutionAnalytics(28);
      if (!active.value) return;
      setAnalytics(data);
      if (!data) {
        setError("No enterprise workspace is linked to this session.");
      }
    } catch (err) {
      if (!active.value) return;
      console.error("[Enterprise] Analytics fetch failed:", err);
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("Could not find the function") || message.includes("schema cache")
          ? "Enterprise analytics are not provisioned yet. Apply the latest Supabase migration, then retry."
          : "Enterprise analytics could not be loaded. Retry in a moment.",
      );
    } finally {
      if (active.value) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const active = { value: true };
    void load(active);
    return () => {
      active.value = false;
    };
  }, [load, refreshToken]);

  const summary = analytics ? buildWeeklySummary(analytics) : "";
  const delta = analytics ? analytics.totals.completed7d - analytics.totals.completedPrev7d : 0;
  const companyName = analytics?.companyName ?? companyNameFallback ?? "Enterprise Workspace";

  return (
    <section
      aria-label="Enterprise execution analytics"
      className="flex flex-col gap-5 text-left animate-fade-in"
    >
      <header className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#0D0D11]/85 p-4 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-emerald-400">
              Organization Intelligence
            </p>
            <h2 className="mt-1.5 flex items-center gap-2 font-display text-xl font-black tracking-tight text-white sm:text-2xl">
              <Building2 className="size-5 shrink-0 text-emerald-400" />
              {companyName}
            </h2>
            <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {analytics?.companySlug
                ? `${analytics.companySlug}.${TENANT_ROOT_DOMAIN}`
                : "Company-scoped workspace"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshToken((token) => token + 1)}
            disabled={loading}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300 transition-all hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-black disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </button>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[11px] font-medium leading-relaxed text-zinc-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400/80" />
          Company-scoped telemetry. Only members of {companyName} can read these aggregates, and no
          other tenant is included. Managers see only what employees explicitly logged.
        </p>
      </header>

      {loading && !analytics && <SkeletonGrid />}

      {error && !loading && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                Analytics unavailable
              </h3>
              <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-400">{error}</p>
              <button
                type="button"
                onClick={() => setRefreshToken((token) => token + 1)}
                className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-500 hover:text-black"
              >
                <RefreshCw className="size-3" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {analytics && (
        <>
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <KpiCard
              icon={<CheckCircle2 className="size-4" />}
              label="Closures this week"
              value={String(analytics.totals.completed7d)}
              sub={delta === 0 ? "Level with last week" : `${delta > 0 ? "+" : ""}${delta} vs last week`}
              tone={delta >= 0 ? "emerald" : "rose"}
            />
            <KpiCard
              icon={<Users className="size-4" />}
              label="Active operators"
              value={`${analytics.totals.activeOperators7d}/${analytics.members}`}
              sub="Logged at least one closure"
              tone="sky"
            />
            <KpiCard
              icon={<Activity className="size-4" />}
              label="High-impact closes"
              value={String(analytics.totals.highCompleted7d)}
              sub={`${analytics.totals.carriedOverHigh} carried over`}
              tone={analytics.totals.carriedOverHigh > 0 ? "amber" : "emerald"}
            />
            <KpiCard
              icon={<AlertTriangle className="size-4" />}
              label="Blockers reported"
              value={String(analytics.totals.blockersCount)}
              sub={analytics.totals.blockersCount === 0 ? "No blockers" : "Team reported obstacles"}
              tone={analytics.totals.blockersCount > 0 ? "amber" : "emerald"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.45)] lg:col-span-3 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
                    <BarChart3 className="size-4 shrink-0 text-emerald-400" />
                    Closure Trend
                  </h3>
                  <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
                    {analytics.windowDays}-day window · last 14 days shown
                  </p>
                </div>
                <span className="rounded-md border border-rose-500/25 bg-rose-950/20 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-rose-300">
                  Rose = high impact
                </span>
              </div>

              <TrendChart trend={analytics.trend.slice(-14)} />

              <div className="mt-2 flex justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                <span>Oldest</span>
                <span>Today</span>
              </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.45)] lg:col-span-2 sm:p-5">
              <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
                {delta >= 0 ? (
                  <TrendingUp className="size-4 shrink-0 text-emerald-400" />
                ) : (
                  <TrendingDown className="size-4 shrink-0 text-amber-400" />
                )}
                Weekly Brief
              </h3>
              <p className="mt-3 flex-1 text-xs font-medium leading-relaxed text-zinc-300">
                {summary}
              </p>
              <p className="mt-3 border-t border-emerald-500/10 pt-2 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                Generated {relativeLastClose(analytics.generatedAt)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.45)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-emerald-500/15 pb-3">
              <div>
                <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
                  <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                  Blockers Reported by Team
                </h3>
                <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
                  High-impact items team members have flagged as blocked (from their current plan).
                </p>
              </div>
              <span className="rounded-full border border-amber-500/25 bg-amber-950/20 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-amber-300">
                {analytics.totals.blockersCount} blocker{analytics.totals.blockersCount === 1 ? "" : "s"}
              </span>
            </div>

            {analytics.totals.blockersCount === 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-3 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                No blockers reported. Team has clear paths on high-impact work.
              </div>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {analytics.operators
                  .filter((op) => op.blockers.length > 0)
                  .slice(0, 6)
                  .map((operator) => (
                    <li key={operator.id} className="rounded-xl border border-amber-500/20 bg-black/40 p-3">
                      <p className="min-w-0 truncate text-xs font-black text-white">{operator.name}</p>
                      <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-zinc-400">
                        {operator.blockers.slice(0, 3).join("; ")}
                        {operator.blockers.length > 3 ? ` +${operator.blockers.length - 3} more` : ""}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-4 backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.45)] sm:p-5">
            <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
              <Users className="size-4 shrink-0 text-emerald-400" />
              Team Execution Detail
            </h3>

            <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-500/20 bg-black/40 shadow-[inset_0_1px_4px_rgba(16,185,129,0.1)]">
              <div className="grid min-w-[720px] grid-cols-6 border-b border-emerald-500/20 bg-emerald-950/30 px-3 py-2.5 font-mono text-[8px] font-black uppercase tracking-wider text-emerald-400/80">
                <span className="col-span-2">Operator</span>
                <span className="text-center">Completed (28d)</span>
                <span className="text-center">High-impact</span>
                <span className="text-center">Carried over</span>
                <span className="text-center">Blockers</span>
              </div>

              <div className="min-w-[720px] divide-y divide-emerald-500/10">
                {analytics.operators.map((operator) => (
                  <OperatorRow key={operator.id} operator={operator} />
                ))}
                {analytics.operators.length === 0 && (
                  <p className="p-6 text-center text-xs italic text-zinc-600">
                    No operators are linked to this workspace yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function OperatorRow({ operator }: { operator: EnterpriseOperator }) {
  const highCompleted = operator.completedTasks.filter((t) => t.tier === "high").length;

  return (
    <div className="grid grid-cols-6 items-center px-3 py-3 text-xs text-zinc-300 transition-colors hover:bg-emerald-950/10">
      <div className="col-span-2 flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-950/30 font-mono text-[10px] font-black text-emerald-400">
          {operator.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] ?? "")
            .join("")
            .toUpperCase() || "OP"}
        </span>
        <p className="truncate text-[11px] font-bold text-white">{operator.name}</p>
      </div>

      <div className="text-center">
        <p className="font-mono font-black tabular-nums text-emerald-400">
          {operator.completedTasks.length}
        </p>
        <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-600">
          {operator.completedTasks.filter((t) => t.tier !== "high").length} med/low
        </p>
      </div>

      <p className="text-center font-mono font-black tabular-nums text-emerald-400">
        {highCompleted}
      </p>

      <p className={`text-center font-mono font-black tabular-nums ${operator.carriedOverHigh.length > 0 ? "text-amber-400" : "text-zinc-600"}`}>
        {operator.carriedOverHigh.length}
      </p>

      <p className={`text-center font-mono font-black tabular-nums ${operator.blockers.length > 0 ? "text-rose-400" : "text-zinc-600"}`}>
        {operator.blockers.length}
      </p>
    </div>
  );
}

function TrendChart({ trend }: { trend: EnterpriseAnalytics["trend"] }) {
  if (trend.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-emerald-500/15 bg-black/40 px-3 py-6 text-center text-xs italic text-zinc-600">
        No trend data yet.
      </p>
    );
  }

  const max = Math.max(1, ...trend.map((day) => day.completed));

  return (
    <div className="mt-4 flex h-40 items-end gap-1.5 rounded-xl border border-emerald-500/15 bg-black/40 p-3">
      {trend.map((day) => {
        const height = day.completed === 0 ? 3 : Math.max(8, Math.round((day.completed / max) * 100));
        return (
          <div
            key={day.date}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={`${formatFullDate(day.date)}: ${day.completed} closure${day.completed === 1 ? "" : "s"}, ${day.high} high-impact`}
          >
            <span className="font-mono text-[8px] font-black tabular-nums text-emerald-400/80">
              {day.completed > 0 ? day.completed : ""}
            </span>
            <div
              className="w-full rounded-t transition-all duration-700"
              style={{
                height: `${height}%`,
                background:
                  day.high > 0
                    ? "linear-gradient(to top, #10b981 0%, #10b981 45%, #fb7185 100%)"
                    : day.completed > 0
                      ? "#10b981"
                      : "rgba(16,185,129,0.18)",
                boxShadow: day.completed > 0 ? "0 0 12px rgba(16,185,129,0.18)" : "none",
              }}
            />
            <span className="font-mono text-[8px] font-bold uppercase text-zinc-600">
              {formatDayLabel(day.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "rose" | "sky";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-500/25 bg-rose-950/20 text-rose-300"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-950/20 text-amber-300"
        : tone === "sky"
          ? "border-sky-500/25 bg-sky-950/20 text-sky-300"
          : "border-emerald-500/25 bg-emerald-950/20 text-emerald-300";

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${toneClass}`}>
      <div className="flex items-center gap-1.5 opacity-80">
        {icon}
        <p className="font-mono text-[8px] font-black uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-black tabular-nums leading-none text-white">
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-wider opacity-70">
        {sub}
      </p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-xl border border-emerald-500/15 bg-emerald-950/10" />
      ))}
    </div>
  );
}