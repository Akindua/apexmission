import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Crosshair,
  Flame,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Radio,
  ShieldCheck,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { PrivacyShieldBanner } from "@/components/PrivacyShieldBanner";
import type { ImpactTier, MissionState } from "@/lib/mission-store";

export interface OperatorInductionProps {
  open: boolean;
  operatorName: string;
  mission: string;
  dailyAction: string;
  tasks: MissionState["tasks"];
  isCorporate: boolean;
  companyName?: string | null;
  onCommitMission: (mission: string) => void;
  onCommitDailyAction: (action: string) => void;
  onAddTask: (tier: ImpactTier, text: string) => boolean;
  onComplete: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

const STEPS = [
  {
    eyebrow: "01 / MISSION DIRECTIVE",
    title: "Declare the objective that outranks distraction.",
    icon: Target,
  },
  {
    eyebrow: "02 / PRIORITY MATRIX",
    title: "Map the first high-impact objective.",
    icon: ListChecks,
  },
  {
    eyebrow: "03 / DAILY FOCUS ACTION",
    title: "One action. Today. Non-negotiable.",
    icon: Flame,
  },
  {
    eyebrow: "04 / COMMAND MODULES",
    title: "Know the console. Know the boundaries.",
    icon: LayoutDashboard,
  },
  {
    eyebrow: "05 / EXECUTION CONTRACT",
    title: "Accept the standing orders.",
    icon: ShieldCheck,
  },
] as const;

export function OperatorInduction({
  open,
  operatorName,
  mission,
  dailyAction,
  tasks,
  isCorporate,
  companyName = null,
  onCommitMission,
  onCommitDailyAction,
  onAddTask,
  onComplete,
  onSkip,
}: OperatorInductionProps) {
  const [step, setStep] = useState(0);
  const [missionDraft, setMissionDraft] = useState(mission);
  const [dailyDraft, setDailyDraft] = useState(dailyAction);
  const [taskDraft, setTaskDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(0);
      setMissionDraft(mission);
      setDailyDraft(dailyAction);
      setTaskDraft("");
      setBusy(false);
    }
    wasOpen.current = open;
  }, [open, mission, dailyAction]);

  if (!open) return null;

  const highTasks = tasks?.high ?? [];
  const pendingHigh = highTasks.filter((task) => !task.done);
  const callSign = (operatorName || "OPERATOR").toUpperCase();
  const current = STEPS[step] ?? STEPS[0];
  const StepIcon = current.icon;

  const persistOnboarding = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  const skipInduction = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSkip();
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (step === 0) onCommitMission(missionDraft);
    if (step === 2) onCommitDailyAction(dailyDraft);

    if (step >= STEPS.length - 1) {
      void persistOnboarding();
      return;
    }

    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const addPriorityObjective = () => {
    const text = taskDraft.trim();
    if (!text) return;
    if (onAddTask("high", text)) setTaskDraft("");
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 px-3 py-4 backdrop-blur-md sm:px-6 sm:py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-induction-title"
        className="mx-auto my-auto flex min-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#07110d] shadow-[0_0_80px_rgba(16,185,129,0.18)]"
      >
        <header className="sticky top-0 z-10 border-b border-emerald-500/20 bg-[#07110d]/95 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400">
                Operator Induction // Zero-API
              </p>
              <h1
                id="operator-induction-title"
                className="mt-1 truncate font-display text-lg font-black tracking-tight text-white sm:text-2xl"
              >
                {callSign} — First Session
              </h1>
            </div>
            <button
              type="button"
              onClick={() => void skipInduction()}
              disabled={busy}
              aria-label="Skip operator induction"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500 transition-colors hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((item, index) => (
              <span
                key={item.eyebrow}
                aria-hidden
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  index <= step ? "bg-emerald-400" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </header>

        <div className="flex-1 px-4 py-5 sm:px-8 sm:py-7">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <StepIcon className="size-5" />
            </span>
            <div className="min-w-0 text-left">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80">
                {current.eyebrow}
              </p>
              <h2 className="mt-1 font-display text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
                {current.title}
              </h2>
            </div>
          </div>

          <div className="mt-6">
            {step === 0 && (
              <div className="space-y-4 text-left">
                <p className="text-sm leading-relaxed text-zinc-400">
                  Your mission is the filter. If an objective does not move it forward, it does
                  not belong in your matrix. Write it as a measurable outcome, not a mood.
                </p>
                <label htmlFor="induction-mission" className="glass-input-label block">
                  Master Vision Statement
                </label>
                <input
                  id="induction-mission"
                  value={missionDraft}
                  onChange={(event) => setMissionDraft(event.target.value)}
                  placeholder="e.g. Launch a profitable design studio within 12 months"
                  autoFocus
                  className="glass-input min-h-11 w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-700"
                />
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/20 p-3.5 font-mono text-[10px] font-bold uppercase leading-relaxed tracking-wider text-emerald-400/80">
                  Track: {isCorporate ? "Corporate Operator" : "Personal Operator"}
                  {companyName ? ` · ${companyName}` : ""}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4 text-left">
                <p className="text-sm leading-relaxed text-zinc-400">
                  High-impact work executes first. Medium work fills the gaps. Low-impact work is
                  maintenance. Add one objective that would make today a win if nothing else moved.
                </p>

                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-black/50 px-4 shadow-[inset_0_1px_3px_rgba(16,185,129,0.1)] transition-colors focus-within:border-emerald-500/50">
                  <Crosshair className="size-4 shrink-0 text-emerald-400" />
                  <input
                    id="induction-task"
                    value={taskDraft}
                    onChange={(event) => setTaskDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addPriorityObjective();
                      }
                    }}
                    placeholder="Add a high-impact objective…"
                    className="field-flush h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addPriorityObjective}
                    disabled={!taskDraft.trim()}
                    aria-label="Add high-impact objective"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-950/50 text-emerald-400 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-black disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
                    High-Impact Matrix
                  </p>
                  {pendingHigh.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {pendingHigh.slice(0, 4).map((task) => (
                        <li
                          key={task.id ?? task.text}
                          className="flex items-start gap-2 text-xs font-semibold text-zinc-300"
                        >
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span className="min-w-0 break-words">{task.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs font-medium italic text-zinc-600">
                      No high-impact objectives mapped yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 text-left">
                <p className="text-sm leading-relaxed text-zinc-400">
                  This is the one action that must close today. Completing it extends your streak
                  and credits. Everything else is secondary.
                </p>
                <label htmlFor="induction-daily" className="glass-input-label block">
                  Today's Master Focus Action
                </label>
                <input
                  id="induction-daily"
                  value={dailyDraft}
                  onChange={(event) => setDailyDraft(event.target.value)}
                  placeholder="e.g. Send the proposal to the client"
                  className="glass-input min-h-11 w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-700"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      Active streak
                    </p>
                    <p className="mt-1 font-mono text-lg font-black text-emerald-400">0 days</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      High-impact open
                    </p>
                    <p className="mt-1 font-mono text-lg font-black text-emerald-400">
                      {pendingHigh.length}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 text-left">
                <p className="text-sm leading-relaxed text-zinc-400">
                  The console is deliberately small. Learn where each function lives, then stop
                  navigating and start executing.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      icon: LayoutDashboard,
                      title: "Workspace",
                      copy: "Mission, priority matrix, and the single daily action.",
                    },
                    {
                      icon: Trophy,
                      title: "Ranks",
                      copy: isCorporate
                        ? "Hidden in corporate scope. Ranking telemetry is not exposed."
                        : "Public operator standings. Check after execution, not before.",
                    },
                    {
                      icon: HardDrive,
                      title: "Hardware",
                      copy: "Themes, badges, and streak protection. Cosmetic only.",
                    },
                    {
                      icon: MessageSquare,
                      title: "Mission Coach",
                      copy: "Explicitly opened performance review. Not part of this induction.",
                    },
                  ].map((module) => (
                    <div
                      key={module.title}
                      className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <module.icon className="size-4 text-emerald-400" />
                        <p className="font-mono text-[10px] font-black uppercase tracking-wider text-white">
                          {module.title}
                        </p>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        {module.copy}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <PrivacyShieldBanner />
                  <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/15 p-3.5">
                    <p className="text-[11px] font-medium leading-relaxed text-zinc-400">
                      <span className="font-bold text-zinc-300">Privacy Guarantee.</span>{" "}
                      ApexMissions only logs manually submitted milestones. We never monitor your
                      device background, screen time, or location parameters.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                  <Lock className="size-3.5 shrink-0" />
                  Induction and login briefing run locally. No AI API keys are used.
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 text-left">
                <p className="text-sm leading-relaxed text-zinc-400">
                  Review the baseline. Then accept the standing orders and enter the workspace.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      Master vision
                    </p>
                    <p className="mt-1 break-words text-xs font-bold text-white">
                      {missionDraft.trim() || "NOT DECLARED"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      Daily action
                    </p>
                    <p className="mt-1 break-words text-xs font-bold text-white">
                      {dailyDraft.trim() || "NOT ASSIGNED"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      High-impact objectives
                    </p>
                    <p className="mt-1 font-mono text-lg font-black text-emerald-400">
                      {pendingHigh.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/15 bg-black/30 p-3.5">
                    <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      Operating track
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-white">
                      {isCorporate ? (
                        <Building2 className="size-3.5 text-emerald-400" />
                      ) : (
                        <Radio className="size-3.5 text-emerald-400" />
                      )}
                      {isCorporate ? "Corporate" : "Personal"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                    Standing Orders
                  </p>
                  <ol className="mt-2.5 space-y-2 text-xs font-medium leading-relaxed text-zinc-300">
                    <li className="flex gap-2">
                      <span className="font-mono font-black text-emerald-400">1.</span>
                      Execute the highest-impact objective before anything else.
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono font-black text-emerald-400">2.</span>
                      Close the daily action. Do not renegotiate it mid-day.
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono font-black text-emerald-400">3.</span>
                      Log the night reflection. Unrecorded lessons repeat.
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono font-black text-emerald-400">4.</span>
                      Open the coach only for a performance review, not for company.
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-emerald-500/20 bg-[#07110d]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <button
            type="button"
            onClick={() => void skipInduction()}
            disabled={busy}
            className="min-h-11 rounded-xl px-3 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40 sm:order-1"
          >
            Skip induction
          </button>

          <div className="flex w-full gap-2 sm:order-2 sm:w-auto">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={busy}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-4 font-mono text-[10px] font-black uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:opacity-40 sm:flex-none"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </button>
            )}

            <button
              type="button"
              onClick={() => void (step === STEPS.length - 1 ? persistOnboarding() : goNext())}
              disabled={busy}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 font-mono text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 sm:flex-none"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : step === STEPS.length - 1 ? (
                <>
                  <Check className="size-4" />
                  Begin Execution
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
