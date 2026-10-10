import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Flame, Lock, Plus, Sparkles, Loader2, Target, TimerReset, Trash2 } from "lucide-react";
import { PaywallModal } from "@/components/PaywallModal";
import { MissionCoach } from "@/components/MissionCoach";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { supabase } from "@/integrations/supabase/client";
import { startCheckout, type PlanId } from "@/lib/billing.functions";
import {
  completeDailyToday,
  defaultState,
  FREE_TASK_LIMIT,
  loadState,
  msUntilReset,
  saveState,
  todayKey,
  type ImpactTier,
  type MissionState,
  type Task,
} from "@/lib/mission-store";
import { generateMissionPlan } from "@/lib/mission-planner";

export const Route = createFileRoute("/app")({
  component: ApexMission,
});

function ApexMission() {
  const [state, setState] = useState<MissionState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [drafts, setDrafts] = useState<Record<ImpactTier, string>>({ high: "", medium: "", low: "" });
  const [dailyDraft, setDailyDraft] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);
  const [resetMs, setResetMs] = useState<number | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);

  const navigate = useNavigate();
  const checkout = useServerFn(startCheckout);

  const [isGeneratingMissionPlan, setIsGeneratingMissionPlan] = useState(false);
  const [hasGeneratedMissionPlan, setHasGeneratedMissionPlan] = useState(false);

  const [isEvening, setIsEvening] = useState(() => {
    const currentHour = new Date().getHours();
    return currentHour >= 18 || currentHour < 1;
  });

  const BETA_MODE = true;
  const { premium: subscriptionPremium, tier } = useSubscriptionTier();
  const premium = BETA_MODE || subscriptionPremium;

  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    const today = todayKey();
    const lastSeen = localStorage.getItem("apexmission-morning-checkin");
    
    if (lastSeen !== today && state.daily.text.trim().length > 0) {
      navigate({ to: "/daily-briefing" });
    } 
  }, [hydrated, navigate, state.daily.text]);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentHour = new Date().getHours();
      setIsEvening(currentHour >= 18 || currentHour < 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  function handleGoToNightReflection() {
    navigate({ to: "/night-reflection" });
  }

  const [greetingText] = useState(() => {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    return `${month}. ${dayNum}${suffix} ${year}`;
  });

  const [userName, setUserName] = useState("User");

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || "User";
        setUserName(displayName.charAt(0).toUpperCase() + displayName.slice(1));
      }
    };
    fetchUserProfile();
  }, []);

  useEffect(() => {
    setResetMs(msUntilReset());
    const id = window.setInterval(() => setResetMs(msUntilReset()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const s = loadState();
    setState(s);
    setDailyDraft(s.daily.text);
    setHasGeneratedMissionPlan(localStorage.getItem("apexmission-mission-plan-generated") === "true");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);

  const { total, done } = useMemo(() => {
    let total = 0;
    let done = 0;
    if (state && state.tasks) {
      for (const tier of TIERS) {
        const tierTasks = state.tasks[tier.key] || [];
        for (const t of tierTasks) {
          total += 1;
          if (t.done) done += 1;
        }
      }
    }
    return { total, done };
  }, [state]);

  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  function addTask(tier: ImpactTier) {
    const text = drafts[tier].trim();
    if (!text) return;
    if (!premium && total >= FREE_TASK_LIMIT) {
      setPaywall(`The free plan tracks up to ${FREE_TASK_LIMIT} priority tasks. Upgrade to map out your full mission without limits.`);
      return;
    }
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [tier]: [...(s.tasks[tier] || []), { id: nextId(), text, done: false }] },
    }));
    setDrafts((d) => ({ ...d, [tier]: "" }));
  }

  async function generateActionPlan() {
    if (!premium) {
      setPaywall("AI Mission Breakdown is a premium feature. Upgrade to turn any mission into concrete priorities instantly.");
      return;
    }
    if (isGeneratingMissionPlan) return;
    setIsGeneratingMissionPlan(true);

    try {
      const plan = await generateMissionPlan(state.mission);
      setState((s) => ({
        ...s,
        mission: plan.mission || s.mission,
        tasks: {
          high: plan.high.map((text) => ({ id: nextId(), text, done: false })),
          medium: plan.medium.map((text) => ({ id: nextId(), text, done: false })),
          low: plan.low.map((text) => ({ id: nextId(), text, done: false })),
        },
        daily: { text: plan.dailyAction, done: false, date: todayKey() },
      }));
      setDailyDraft(plan.dailyAction);
      localStorage.setItem("apexmission-mission-plan-generated", "true");
      setHasGeneratedMissionPlan(true);
    } catch (error) {
      console.error("Mission plan generation failed:", error);
    } finally {
      setIsGeneratingMissionPlan(false);
    }
  }

  async function handleUpgrade(planId: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    try {
      const res = await checkout({
        data: { plan: planId as PlanId, origin: window.location.origin },
      });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setPaywall(res.message);
    } catch (e) {
      setPaywall(e instanceof Error ? e.message : "Checkout could not be started.");
    }
  }

  function toggleTask(tier: ImpactTier, id: string) {
    setState((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [tier]: (s.tasks[tier] || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      },
    }));
  }

  function removeTask(tier: ImpactTier, id: string) {
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [tier]: (s.tasks[tier] || []).filter((t) => t.id !== id) },
    }));
  }

  function commitDailyText() {
    const text = dailyDraft.trim();
    setState((s) => ({ ...s, daily: { ...s.daily, text, date: todayKey() } }));
  }

  function toggleDaily() {
    if (!state.daily.text.trim()) return;
    setState((s) => {
      const done = !s.daily.done;
      return {
        ...s,
        daily: { ...s.daily, done, date: todayKey() },
        streak: done ? completeDailyToday(s.streak) : s.streak,
      };
    });
    if (!state.daily.done) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 500);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        
        {/* 🌟 PREMIUM NAVBAR HEADER */}
        <header className="flex items-center justify-between border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <Target className="size-4.5" />
            </div>
            <div>
              <span className="font-black text-sm font-display tracking-[0.25em] text-white uppercase block">
                ApexMission
              </span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mt-0.5">
                Command Console · {userName}
              </span>
            </div>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/20 border border-emerald-500/10 px-3 py-1.5 rounded-lg">
            {greetingText}
          </span>
        </header>

        {/* 🏢 1. THE MISSION CARD */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 sm:p-8 shadow-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          <label
            htmlFor="mission"
            className="text-[10px] font-black tracking-widest text-zinc-500 uppercase block"
          >
            Core Vision Statement
          </label>
          <input
            id="mission"
            value={state.mission}
            onChange={(e) => setState((s) => ({ ...s, mission: e.target.value }))}
            placeholder="Lock down your high-leverage vision matrix…"
            className="mt-3 w-full bg-transparent font-display text-2xl font-black tracking-tight text-white outline-none placeholder:text-zinc-800 sm:text-4xl"
          />
                    <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800/60">
              <div
                className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)] transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-zinc-500 tabular-nums">
              {total === 0 ? "0% · No objects mapped" : `${progress}% · ${done}/${total} locked`}
            </span>
            
            <button
              type="button"
              onClick={generateActionPlan}
              disabled={isGeneratingMissionPlan || !hydrated}
              className="transform group flex h-10 items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 text-xs font-bold tracking-wide text-zinc-200 transition-all duration-300 ease-out hover:scale-102 hover:border-emerald-500/40 hover:bg-emerald-950/20 hover:text-emerald-400 active:scale-98 disabled:opacity-40"
            >
              {isGeneratingMissionPlan ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                  <span>Analyzing Matrix...</span>
                </>
              ) : hasGeneratedMissionPlan ? (
                <>
                  <Sparkles className="size-3.5 text-emerald-400" />
                  <span>Regenerate AI Plan</span>
                </>
              ) : premium ? (
                <>
                  <Sparkles className="size-3.5 text-emerald-400 transition-transform duration-300 group-hover:rotate-12" />
                  <span>Generate AI Plan</span>
                </>
              ) : (
                <>
                  <Lock className="size-3.5 text-zinc-600" />
                  <span>Generate AI Plan</span>
                </>
              )}
            </button>
            {premium && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 text-[9px] font-black tracking-wider text-emerald-400 uppercase">
                {tier === "lifetime" ? "Lifetime" : "Premium"}
              </span>
            )}
          </div>
        </section>

        {/* 📊 2. THE PRIORITY MATRIX COLUMNS */}
        <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.key} className={`rounded-2xl border border-zinc-800 bg-[#0D0D11] p-5 flex flex-col justify-between shadow-xl transition-all duration-300 ${tier.borderClass}`}>
              <div>
                <div className="flex items-center gap-2 border-b border-zinc-900/60 pb-3 mb-4">
                  <span className={`size-2 rounded-full ${tier.accentClass}`} />
                  <h2 className={`text-[10px] font-black tracking-widest uppercase ${tier.textClass}`}>
                    {tier.label}
                  </h2>
                  <span className="ml-auto font-mono text-xs font-bold text-zinc-600 tabular-nums">
                    {(state.tasks?.[tier.key] || []).filter((t) => t.done).length}/{(state.tasks?.[tier.key] || []).length}
                  </span>
                </div>

                <ul className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
                  {(state.tasks?.[tier.key] || []).map((task) => (
                    <TaskRow 
                      key={task.id} 
                      task={task} 
                      onToggle={() => toggleTask(tier.key, task.id)} 
                      onRemove={() => removeTask(tier.key, task.id)} 
                    />
                  ))}
                  {(state.tasks?.[tier.key] || []).length === 0 && (
                    <li className="py-4 text-center text-xs font-medium text-zinc-700 italic">No execution objects mapped.</li>
                  )}
                </ul>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-900 bg-black/40 px-3 transition-all duration-300 focus-within:border-emerald-500/40 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                <Plus className="size-4 shrink-0 text-zinc-600" />
                <input
                  value={drafts[tier.key] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [tier.key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(tier.key)}
                  placeholder={tier.placeholder}
                  className="h-10 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
                />
              </div>
            </div>
          ))}
        </section>

        {/* ⚡ 3. THE DAILY HIGH-URGENCY ACTION STEP */}
        <section className={`rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 transition-all duration-500 sm:p-8 shadow-2xl relative overflow-hidden ${state.daily.done ? "border-emerald-500/20 bg-emerald-950/5 shadow-[0_0_50px_rgba(16,185,129,0.02)]" : ""}`}>
          <label htmlFor="daily-action" className="text-[10px] font-black tracking-widest text-zinc-500 uppercase block">
            Today's Master Focus Action
          </label>

          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={toggleDaily}
              disabled={!hydrated || !state.daily.text.trim()}
              className={`group flex shrink-0 items-center justify-center rounded-xl border-2 transition-all duration-300 ${
                state.daily.done
                  ? "size-14 border-emerald-400 bg-emerald-400 text-black shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                  : "size-14 border-zinc-800 bg-black/40 text-zinc-600 hover:border-zinc-700 disabled:opacity-40"
              } ${justCompleted ? "scale-110" : ""}`}
            >
              <Check
                className={`size-6 transition-all duration-200 ${
                  state.daily.done ? "scale-100 text-black font-black" : "scale-50 text-transparent group-hover:text-zinc-600"
                }`}
                strokeWidth={3}
              />
            </button>

            <input
              id="daily-action"
              value={dailyDraft}
              onChange={(e) => setDailyDraft(e.target.value)}
              onBlur={commitDailyText}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Lock down the single highest-impact metric block for today…"
              disabled={state.daily.done}
              className={`w-full bg-transparent font-display text-xl font-bold tracking-tight outline-none transition-all duration-300 placeholder:text-zinc-700 sm:text-2xl ${
                state.daily.done ? "text-zinc-600 line-through decoration-zinc-800 decoration-2" : "text-white"
              }`}
            />
          </div>

          {/* Evening Closeout Anchor Router Token */}
          {isEvening && (
            <div className="w-full max-w-md mx-auto mt-8 border-t border-zinc-900 pt-6">
              <button
                onClick={handleGoToNightReflection}
                className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-800 bg-[#111115] p-4 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <div className="flex items-center gap-3 relative z-10">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 group-hover:border-emerald-500/20 group-hover:bg-emerald-950/30 group-hover:text-emerald-400 transition-colors duration-300">
                    <span className="text-base">🌙</span>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Day Closeout</p>
                    <h4 className="text-sm font-bold text-zinc-300 group-hover:text-white">Win Your Night</h4>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 transition-colors group-hover:text-emerald-400 relative z-10">
                  <span>Lock in Progress</span>
                  <span className="transform transition-transform duration-300 group-hover:translate-x-1">→</span>
                </div>
              </button>
            </div>
          )}

          {/* Streak metrics rows */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-900 pt-5">
            <div className={`flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-black/40 ${state.streak?.count > 0 ? "border-orange-500/20 bg-orange-950/10 text-orange-400 animate-pulse" : "text-zinc-600"}`}>
              <Flame className={`size-5 ${state.streak?.count > 0 ? "fill-orange-500 text-orange-400" : ""}`} />
            </div>
            <div className="text-left">
              <div className="font-mono text-sm font-black text-white tracking-wide">
                {state.streak?.count || 0} Day{state.streak?.count === 1 ? "" : "s"}
              </div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
                Active Execution Streak
              </div>
            </div>
            
            <div className="ml-auto flex items-center gap-3 rounded-xl border border-zinc-900 bg-black/40 px-3 py-2 text-left">
            <TimerReset className="size-4 text-emerald-400 animate-pulse" />
              <div>
                <div className="font-mono text-sm font-black text-emerald-400 tabular-nums">
                  {resetMs === null ? "--:--:--" : formatCountdown(resetMs)}
                </div>
                <div className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
                  until daily reset
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <PaywallModal
        open={paywall !== null}
        reason={paywall ?? ""}
        onClose={() => setPaywall(null)}
        onUpgrade={handleUpgrade}
      />

      <MissionCoach
        premium={premium}
        onLockedHistory={() =>
          setPaywall(
            "Your full coach history is a premium feature. Upgrade to keep every conversation with your Mission Coach.",
          )
        }
        onActionPlanGenerated={(plan) => {
          setState((s) => ({
            ...s,
            mission: plan.mission || s.mission,
            tasks: {
              high: plan.high.map((text: string) => ({
                id: nextId(),
                text,
                done: false,
              })),
              medium: plan.medium.map((text: string) => ({
                id: nextId(),
                text,
                done: false,
              })),
              low: plan.low.map((text: string) => ({
                id: nextId(),
                text,
                done: false,
              })),
            },
            daily: {
              text: plan.dailyAction,
              done: false,
              date: todayKey(),
            },
          }));
          setDailyDraft(plan.dailyAction);
        }}
      />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
}: {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-2.5 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 py-2.5 transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-900/20">
      <button
        type="button"
        onClick={onToggle}
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
          task.done
            ? "border-emerald-500 bg-emerald-500 text-black font-black"
            : "border-zinc-800 bg-black/40 text-transparent hover:border-zinc-700"
        }`}
      >
        {task.done && <Check className="size-3.5 stroke-[3]" />}
      </button>

      <span
        className={`flex-1 text-xs font-semibold truncate transition-all duration-300 ${
          task.done ? "text-zinc-600 line-through decoration-zinc-800" : "text-zinc-300"
        }`}
      >
        {task.text}
      </span>

      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-600 hover:text-rose-400 rounded"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

const TIERS: Array<{
  key: ImpactTier;
  label: string;
  accentClass: string;
  borderClass: string;
  textClass: string;
  placeholder: string;
}> = [
  {
    key: "high",
    label: "High Impact",
    accentClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]",
    borderClass: "focus-within:border-rose-500/30",
    textClass: "text-rose-400 font-black",
    placeholder: "Add higher leverage target…",
  },
  {
    key: "medium",
    label: "Medium Impact",
    accentClass: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
    borderClass: "focus-within:border-amber-500/30",
    textClass: "text-amber-400 font-black",
    placeholder: "Add secondary sub-task…",
  },
  {
    key: "low",
    label: "Low Impact",
    accentClass: "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]",
    borderClass: "focus-within:border-sky-500/30",
    textClass: "text-sky-400 font-black",
    placeholder: "Add maintenance item…",
  },
];

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `t-${Date.now()}-${idCounter}`;
}

