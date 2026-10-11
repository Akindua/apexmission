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

  const [showMilestoneCelebration, setShowMilestoneCelebration] = useState<number | null>(null);
  const [activeLayoutTheme, setActiveLayoutTheme] = useState<string>("layout-default");

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

  useEffect(() => {
    const activeLayout = localStorage.getItem("apexmission-active-theme") || "layout-default";
    setActiveLayoutTheme(activeLayout);
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

  const themeClasses = useMemo(() => {
    switch (activeLayoutTheme) {
      case "layout-midnight":
        return {
          bg: "bg-[#050508] text-zinc-100",
          card: "bg-[#0A0A0F] border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.02)]",
          border: "border-emerald-500/20"
        };
      case "layout-cyber":
        return {
          bg: "bg-[#080500] text-amber-100",
          card: "bg-[#0F0A00] border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.02)]",
          border: "border-amber-500/20"
        };
      case "layout-stealth":
        return {
          bg: "bg-[#090A0F] text-slate-100",
          card: "bg-[#111218] border-zinc-800 shadow-none",
          border: "border-zinc-800"
        };
      default:
        return {
          bg: "bg-black text-zinc-100",
          card: "bg-[#0D0D11] border-zinc-800 shadow-xl",
          border: "border-zinc-800"
        };
    }
  }, [activeLayoutTheme]);

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
          medium: plan.medium.map((text) => ({ id: text, done: false })),
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
    
    const wasDone = state.daily.done;
    const nextDone = !wasDone;
    
    setState((s) => {
      const updatedStreak = nextDone ? completeDailyToday(s.streak) : s.streak;
      
      if (nextDone) {
        const currentCount = updatedStreak.count;
        const milestones = [3, 7, 14, 30]
        if (milestones.includes(currentCount)) {
          setTimeout(() => setShowMilestoneCelebration(currentCount), 300);
        }
      }
      
      return {
        ...s,
        daily: { ...s.daily, done: nextDone, date: todayKey() },
        streak: updatedStreak
      };
    });

    if (nextDone) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 500);
    }
  }

  return (
    <div className={`min-h-screen transition-all duration-500 ease-in-out ${themeClasses.bg}`}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        
        {/* Navbar Header */}
        <header className={`flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between ${themeClasses.border}`}>
          <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <Target className="size-4.5" />
            </div>
            <div className="text-left">
              <span className="font-black text-sm font-display tracking-[0.25em] text-white uppercase block">
                ApexMission
              </span>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mt-0.5">
                Command Console · {userName}
              </span>
            </div>
          </div>

          {/* Sliding Control Tabs Bar Block - Hidden from view layout for testing focus */}
          <div className="hidden items-center gap-1.5 rounded-xl bg-[#0D0D11] border border-zinc-800 p-1 mx-auto sm:mx-0">
            <button
              type="button"
              onClick={() => navigate({ to: "/app" })}
              className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white text-black shadow-md"
            >
              Workspace Grid
            </button>
          </div>

          <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/20 border border-emerald-500/10 px-3 py-1.5 rounded-lg text-center hidden sm:inline-block">
            {greetingText}
          </span>
        </header>

        {/* --- CORE WORKSPACE FOCUS GRID PANELS --- */}
        <div className="flex flex-col gap-6 animate-fade-in">
          
          {/* 🏢 1. THE MISSION CARD CONTAINER */}
          <section className={`relative overflow-hidden rounded-2xl border p-6 sm:p-8 ${themeClasses.card}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            <label htmlFor="mission" className="text-[10px] font-black tracking-widest text-zinc-500 uppercase block">
              Core Vision Statement
            </label>
            <input
              id="mission"
              value={state.mission}
              onChange={(e) => setState((s) => ({ ...s, mission: e.target.value }))}
              placeholder="Lock down your high-leverage vision matrix…"
              className="mt-3 w-full bg-transparent font-display text-2xl font-black tracking-tight text-white outline-none placeholder:text-zinc-800 sm:text-4xl"
            />
            
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-900/60 pt-5">
              <div className="flex flex-1 items-center gap-4 min-w-40">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)] transition-all duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400 tabular-nums whitespace-nowrap bg-black border border-zinc-800 px-2 py-0.5 rounded">
                  {total === 0 ? "0%" : `${progress}% Done`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={generateActionPlan}
                  disabled={isGeneratingMissionPlan || !hydrated}
                  className="transform group flex h-10 items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 text-xs font-bold tracking-wide text-zinc-200 transition-all duration-300 ease-out hover:scale-102 hover:border-emerald-500/40 hover:bg-emerald-950/20 hover:text-emerald-400 active:scale-98 disabled:opacity-40"
                >
                  {isGeneratingMissionPlan ? (
                    <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Sparkles className="size-3.5 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
                  )}
                  {isGeneratingMissionPlan ? "Analyzing Mission..." : hasGeneratedMissionPlan ? "Regenerate AI Plan" : "Generate AI Plan"}
                </button>
                
                {premium && (
                  <span className="rounded-lg bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1.5 text-[10px] font-black tracking-wider text-emerald-400 uppercase">
                    {tier === "lifetime" ? "Lifetime" : "Premium"}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* 📊 2. THE PRIORITY MATRIX SPLIT COLUMNS */}
          <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.key} className={`flex flex-col rounded-2xl border p-5 ${themeClasses.card}`}>
                <div className="flex items-center gap-2 border-b border-zinc-900/60 pb-3 mb-3">
                  <span className={`size-2 rounded-full ${tier.accentClass}`} />
                  <h2 className={`text-[10px] font-black tracking-widest uppercase ${tier.textClass}`}>
                    {tier.label}
                  </h2>
                  <span className="ml-auto font-mono text-[10px] font-bold bg-black border border-zinc-800 px-2 py-0.5 rounded text-zinc-400 tabular-nums">
                    {(state.tasks[tier.key] || []).filter((t) => t.done).length}/{(state.tasks[tier.key] || []).length}
                  </span>
                </div>

                <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto max-h-[260px] pr-1">
                  {(state.tasks[tier.key] || []).map((task) => (
                    <TaskRow 
                      key={task.id} 
                      task={task} 
                      onToggle={() => toggleTask(tier.key, task.id)} 
                      onRemove={() => removeTask(tier.key, task.id)} 
                    />
                  ))}
                  {(state.tasks[tier.key] || []).length === 0 && (
                    <li className="px-1 py-3 text-xs text-zinc-600 font-medium italic">No execution objects mapped.</li>
                  )}
                </ul>

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 transition-all duration-300 focus-within:border-emerald-500/40 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                  <Plus className="size-3.5 shrink-0 text-zinc-600" />
                  <input
                    value={drafts[tier.key]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [tier.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addTask(tier.key)}
                    placeholder={tier.placeholder}
                    className="h-10 w-full bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
                  />
                </div>
              </div>
            ))}
          </section>

          {/* ⚡ 3. THE DAILY HIGH-URGENCY ACTION STEP CARD */}
          <section className={`rounded-2xl border p-6 sm:p-8 transition-all duration-500 shadow-xl ${themeClasses.card} ${state.daily.done ? "border-emerald-500/30 bg-[#0E1612]/20" : ""}`}>
            <label htmlFor="daily-action" className="text-[10px] font-black tracking-widest text-zinc-500 uppercase block">
              Today's Master Focus Action
            </label>

            <div className="mt-4 flex flex-col items-start gap-5 sm:flex-row sm:items-center border-b border-zinc-900 pb-6 mb-6">
              <button
                type="button"
                onClick={toggleDaily}
                disabled={!hydrated || !state.daily.text.trim()}
                className={`group flex shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                  state.daily.done
                    ? "size-14 border-emerald-400 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                    : "size-14 border-zinc-800 bg-black/40 hover:border-zinc-700 disabled:opacity-40"
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
                  state.daily.done ? "text-zinc-600 line-through decoration-zinc-700 decoration-2" : "text-white"
                }`}
              />
            </div>

            {/* Night Reflection Portal Anchor */}
            {isEvening && (
              <div className="w-full max-w-md mx-auto mb-6 p-1">
                <button
                  onClick={handleGoToNightReflection}
                  className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-800 bg-black p-4 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                >
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 group-hover:border-emerald-500/20 group-hover:bg-emerald-950/30 group-hover:text-emerald-400 transition-colors duration-300">
                      <span className="text-xl">🌙</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Day Closeout</p>
                      <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white">Win Your Night</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 transition-colors group-hover:text-emerald-400 relative z-10">
                    <span>Lock in Progress</span>
                    <span className="transform transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </div>
                </button>
              </div>
            )}

            {/* ⏱️ Streak counter + reset timer metrics */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-black ${state.streak.count > 0 ? "border-orange-500/20 bg-orange-950/10 text-orange-400" : "text-zinc-600"}`}>
                  <Flame className={`size-5 ${state.streak.count > 0 ? "fill-orange-400" : ""}`} />
                </div>
                <div className="text-left">
                  <div className="font-mono text-lg font-black text-white tabular-nums">
                    {state.streak.count} Day{state.streak.count === 1 ? "" : "s"}
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                    Active Execution Streak
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black px-4 py-2">
                <TimerReset className="size-4.5 text-zinc-500" />
                <div className="text-left">
                  <div className="font-mono text-sm font-black text-emerald-400 tabular-nums">
                    {resetMs === null ? "--:--:--" : formatCountdown(resetMs)}
                  </div>
                  <div className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">until calendar reset</div>
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
        
        {/* 🏆 MILESTONE CELEBRATION EMBEDDED POPUP MODAL */}
        {showMilestoneCelebration !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#0E1612]/90 p-8 text-center shadow-[0_0_50px_rgba(16,185,129,0.15)] relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
              
              <div id="apex-progress-card" className="bg-[#0A0F0C] border border-emerald-500/10 rounded-xl p-6 mb-6 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/40 text-emerald-400 mb-4">
                  <Flame className="size-6 fill-emerald-400" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">
                  ApexMission Verified
                </p>
                <h2 className="text-3xl font-black tracking-tight text-white">
                  {showMilestoneCelebration} Day Streak!
                </h2>
                <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-zinc-400">
                  <span>Rank Multiplier:</span>
                  <span className="text-emerald-400 font-mono">+{state.streak?.count * 10} pts</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const cardText = `🔥 Just locked in an elite ${showMilestoneCelebration}-Day Execution Streak on ApexMission! Win your morning, win your day, win your night. join the console loop here: ${window.location.origin}`;
                    navigator.clipboard.writeText(cardText).then(() => {
                      alert("🚀 Core marketing deployment copy copied to clipboard! Share it across your social grids.");
                    });
                  }}
                  className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-98"
                >
                  📢 Share Progress Card
                </button>

                <button
                  type="button"
                  onClick={() => setShowMilestoneCelebration(null)}
                  className="w-full rounded-xl border border-zinc-800 bg-transparent py-3.5 text-sm font-bold text-zinc-400 transition-all duration-300 hover:border-zinc-700 hover:text-white active:scale-98"
                >
                  Continue Mission Execution
                </button>
              </div>
            </div>
          </div>
        )}

        <MissionCoach
          premium={premium}
          onLockedHistory={() => setPaywall("Your full coach history is a premium feature. Upgrade to keep every conversation with your Mission Coach.")}
          onActionPlanGenerated={(plan) => {
            setState((s) => ({
              ...s,
              mission: plan.mission || s.mission,
              tasks: {
                high: plan.high.map((text: string) => ({ id: nextId(), text, done: false })),
                medium: plan.medium.map((text: string) => ({ id: text, done: false })),
                low: plan.low.map((text: string) => ({ id: nextId(), text, done: false })),
              },
              daily: { text: plan.dailyAction, done: false, date: todayKey() },
            }));
            setDailyDraft(plan.dailyAction);
          }}
        />
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove }: { task: Task, onToggle: () => void, onRemove: () => void }) {
  return (
    <li className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-900/60 bg-black/20 px-3 py-2.5 transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-900/30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggle}
          className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200 ${
            task.done 
              ? "border-emerald-400 bg-emerald-400 text-black font-bold" 
              : "border-zinc-800 hover:border-zinc-600 text-transparent"
          }`}
        >
          <Check className="size-3" strokeWidth={3} />
        </button>
        <span className={`text-sm font-semibold truncate ${task.done ? "text-zinc-600 line-through decoration-zinc-800" : "text-zinc-200"}`}>
          {task.text}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-600 hover:bg-zinc-900 hover:text-rose-400 transition-all duration-200"
      >
        ×
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
  { key: "high", label: "High Impact", accentClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]", borderClass: "focus-within:border-rose-500/30", textClass: "text-rose-400 font-bold", placeholder: "Add higher leverage target…" },
  { key: "medium", label: "Medium Impact", accentClass: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]", borderClass: "focus-within:border-amber-500/30", textClass: "text-amber-400 font-bold", placeholder: "Add secondary sub-task…" },
  { key: "low", label: "Low Impact", accentClass: "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]", borderClass: "focus-within:border-sky-500/30", textClass: "text-sky-400 font-bold", placeholder: "Add maintenance item…" }
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
