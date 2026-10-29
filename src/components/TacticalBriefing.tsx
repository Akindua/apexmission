import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Flame,
  Gauge,
  MessageSquare,
  ShieldCheck,
  Target,
  Trophy,
  X,
} from "lucide-react";
import {
  generateTacticalDossier,
  type BehaviorAnalytics,
  type LeaderboardSnapshot,
  type OperatorProfileMetadata,
} from "@/lib/synthetic-briefing";
import type { MissionState } from "@/lib/mission-store";

export interface TacticalBriefingProps {
  open: boolean;
  userName: string;
  operatorProfile: OperatorProfileMetadata | null;
  userRank: string;
  state: MissionState & { failureCount?: number };
  behaviorAnalytics: BehaviorAnalytics;
  companyName?: string | null;
  leaderboard?: LeaderboardSnapshot | null;
  subscriptionTier: string;
  activeTab: string;
  activeTheme: string;
  onClose: () => void;
  onOpenCoach: () => void;
  onExecute: (focus: "mission" | "daily" | "high" | "matrix") => void;
}

export function TacticalBriefing({
  open,
  userName,
  operatorProfile,
  userRank,
  state,
  behaviorAnalytics,
  companyName = null,
  leaderboard = null,
  subscriptionTier,
  activeTab,
  activeTheme,
  onClose,
  onOpenCoach,
  onExecute,
}: TacticalBriefingProps) {
  const dossier = useMemo(
    () =>
      generateTacticalDossier({
        userName,
        operatorName: operatorProfile?.operatorName ?? userName,
        userRank,
        state,
        behaviorAnalytics,
        isFirstSignup: false,
        currentHour: new Date().getHours(),
        companyId: operatorProfile?.companyId ?? null,
        profile: operatorProfile,
        leaderboard,
      }),
    [
      userName,
      operatorProfile,
      userRank,
      state,
      behaviorAnalytics,
      leaderboard,
    ],
  );

  if (!open) return null;

  const riskTone =
    dossier.riskLevel === "CRITICAL"
      ? {
          shell: "border-rose-500/30 bg-rose-950/20",
          text: "text-rose-400",
          icon: "text-rose-400",
        }
      : dossier.riskLevel === "ELEVATED"
        ? {
            shell: "border-amber-500/30 bg-amber-950/20",
            text: "text-amber-400",
            icon: "text-amber-400",
          }
        : {
            shell: "border-emerald-500/30 bg-emerald-950/20",
            text: "text-emerald-400",
            icon: "text-emerald-400",
          };

  const generatedAt = new Date(dossier.generatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-black/85 px-2 py-2 backdrop-blur-md sm:px-6 sm:py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tactical-briefing-title"
        className="mx-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#07110d] shadow-[0_0_80px_rgba(16,185,129,0.18)] sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="shrink-0 border-b border-emerald-500/20 bg-[#07110d]/95 px-4 pb-4 pt-[calc(0.9rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400">
                  Tactical Briefing // Sitrep
                </p>
                <span className="rounded border border-emerald-500/25 bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-emerald-400/80">
                  Zero-API
                </span>
              </div>
              <h1
                id="tactical-briefing-title"
                className="mt-1 truncate font-display text-lg font-black tracking-tight text-white sm:text-2xl"
              >
                {dossier.timeGreeting}, {dossier.callSign}
              </h1>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {dossier.track} · {dossier.rank} · {generatedAt}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tactical briefing"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3 text-emerald-400" />
              Status: {dossier.operationalStatus}
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="size-3 text-emerald-400" />
              {companyName ? companyName : "Personal workspace"}
            </span>
            <span className="flex items-center gap-1.5">
              <Gauge className="size-3 text-emerald-400" />
              {subscriptionTier}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
          <div className={`rounded-xl border p-4 text-left ${riskTone.shell}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-black/30 ${riskTone.icon}`}>
                {dossier.riskLevel === "LOW" ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <AlertTriangle className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className={`font-mono text-[10px] font-black uppercase tracking-[0.2em] ${riskTone.text}`}>
                  Discipline Audit · {dossier.riskLevel}
                </p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-300">
                  {dossier.riskAssessment}
                </p>
                {dossier.riskHabits.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {dossier.riskHabits.map((habit) => (
                      <li
                        key={habit}
                        className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-zinc-400"
                      >
                        <span className={`mt-1.5 size-1 shrink-0 rounded-full ${riskTone.text} bg-current`} />
                        <span className="min-w-0 break-words">{habit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile
              icon={Gauge}
              label="Execution"
              value={`${dossier.executionRate}%`}
              detail={`${dossier.completedTasks}/${dossier.totalTasks} closed`}
            />
            <MetricTile
              icon={Flame}
              label="Streak"
              value={`${dossier.streak}D`}
              detail={`Max ${dossier.maxStreak}D`}
            />
            <MetricTile
              icon={Crosshair}
              label="High-Impact"
              value={String(dossier.pendingHighImpact)}
              detail={dossier.pendingHighImpact > 0 ? "Open objectives" : "Matrix clear"}
            />
            <MetricTile
              icon={Trophy}
              label="Credits"
              value={String(dossier.credits)}
              detail={`${dossier.failures} failures`}
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-4 text-left">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
                Master Vision
              </p>
              <p className={`mt-1.5 break-words text-sm font-bold ${dossier.missionDeclared ? "text-white" : "text-amber-400"}`}>
                {dossier.mission}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
                  Daily Action
                </p>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider ${
                    dossier.dailyDone
                      ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                      : "border-amber-500/30 bg-amber-950/30 text-amber-400"
                  }`}
                >
                  {dossier.dailyDone ? "Executed" : "Pending"}
                </span>
              </div>
              <p className="mt-1.5 break-words text-sm font-bold text-white">
                {dossier.dailyAction}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Target className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
                  Next Objective
                </p>
                <p className="mt-1 break-words text-sm font-bold leading-snug text-white">
                  {dossier.nextObjective}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onExecute(dossier.nextFocus)}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 font-mono text-[10px] font-black uppercase tracking-wider text-black transition-colors hover:bg-emerald-400"
              >
                Execute Now
                <ArrowRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenCoach}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-black/40 px-4 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-950/40"
              >
                <MessageSquare className="size-3.5" />
                Open Mission Coach
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-500/15 bg-black/30 p-4 text-left">
            <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
              <Brain className="size-3" />
              Tactical Directive
            </p>
            <ul className="mt-2 space-y-1.5">
              {dossier.directive.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-[11px] font-medium leading-relaxed text-zinc-300"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-4 text-left">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
                Reflection Loop
              </p>
              <p className="mt-1 text-xs font-semibold text-white">
                {dossier.reflection.morningCount} morning / {dossier.reflection.nightCount} night
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                {dossier.reflection.assessment}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-4 text-left">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
                Rank Ledger
              </p>
              {dossier.leaderboard ? (
                <>
                  <p className="mt-1 text-xs font-semibold text-white">
                    {dossier.leaderboard.rank === null
                      ? "Unranked"
                      : `#${dossier.leaderboard.rank} of ${dossier.leaderboard.totalOperators}`}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    {dossier.leaderboard.creditGap === null
                      ? "Sync the ledger to establish rank."
                      : `${dossier.leaderboard.creditGap} credits behind ${dossier.leaderboard.leaderName}.`}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  {operatorProfile?.companyId
                    ? "Ranking telemetry is redacted inside corporate scope."
                    : "Ledger snapshot unavailable. Execute and resync."}
                </p>
              )}
            </div>
          </div>

          <details className="group mt-4 overflow-hidden rounded-xl border border-emerald-500/15 bg-black/30 text-left">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70 transition-colors hover:text-emerald-300">
              Analytical Annex // Full Readout
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="max-h-80 space-y-3 overflow-y-auto border-t border-emerald-500/10 p-4">
              {dossier.sections.map((section, index) => (
                <div key={`${section.role}-${index}`} className="rounded-lg border border-zinc-900 bg-black/40 p-3">
                  <p className="mb-1.5 font-mono text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600">
                    Section {String(index + 1).padStart(2, "0")}
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-mono text-[10px] font-medium leading-relaxed text-zinc-400">
                    {section.content}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        </div>

        <footer className="shrink-0 border-t border-emerald-500/20 bg-[#07110d]/95 px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 sm:px-8">
          <p className="text-center font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-600">
            Generated locally · No AI API calls · No device monitoring
          </p>
        </footer>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3 text-left">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-emerald-400" />
        <p className="font-mono text-[8px] font-black uppercase tracking-wider text-zinc-500">
          {label}
        </p>
      </div>
      <p className="mt-1 font-mono text-lg font-black tabular-nums text-white">{value}</p>
      <p className="truncate font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-600">
        {detail}
      </p>
    </div>
  );
}
