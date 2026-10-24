import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Flame, Plus, Sparkles, Loader2, Target, TimerReset, Shield, Trophy, LayoutDashboard, Award, HardDrive, HelpCircle } from "lucide-react";
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

  // 🏛️ DYNAMIC OPERATOR REAL-TIME ROSTER TELEMETRY STATES
  const [leaderboardOperators, setLeaderboardOperators] = useState<any[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [activeTab, setActiveTab] = useState<"workspace" | "leaderboard" | "hardware">("workspace");
  const [surpriseLoot, setSurpriseLoot] = useState<{ active: boolean; msg: string; points: number } | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [hasTriggeredAutoBrief, setHasTriggeredAutoBrief] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const userRankIndex = leaderboardOperators.findIndex(op => op.id === currentUserId);
  const userRankText = userRankIndex !== -1 ? `#${userRankIndex + 1} of ${leaderboardOperators.length} Operators` : "Synchronizing node cluster standing...";

  // Live real-time database query pipeline selector function
  const fetchLiveAccountabilityRoster = async () => {
    if (loadingRoster) return;
    setLoadingRoster(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, current_streak, max_streak, failure_count, operational_status, credits")
        .order("credits", { ascending: false });

      if (error) throw error;
      if (data) {
        const normalizedData = data.map(op => ({ ...op, points: op.credits || 0 }));
        setLeaderboardOperators(normalizedData);
        localStorage.setItem("apexmission-leaderboard-cache", JSON.stringify(normalizedData));
      }
    } catch (err) {
      console.error("Failed to map dynamic roster profiles ledger:", err);
    } finally {
      setLoadingRoster(false);
    }
  };

  // 🚀 IMMEDIATE APP SESSION & LEADERBOARD INITIALIZATION
  useEffect(() => {
    const initializeAppSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || "User";
        setUserName(displayName.charAt(0).toUpperCase() + displayName.slice(1));

        const { data: profileData } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", user.id)
          .single();

        if (profileData && profileData.credits !== undefined) {
          setState(s => ({ ...s, points: profileData.credits }));
        }
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, current_streak, max_streak, failure_count, operational_status, credits")
          .order("credits", { ascending: false });

        if (!error && data) {
          const normalizedData = data.map(op => ({ ...op, points: op.credits || 0 }));
          setLeaderboardOperators(normalizedData);
          localStorage.setItem("apexmission-leaderboard-cache", JSON.stringify(normalizedData));
        }
      } catch (err) {
        console.error("Failed to map dynamic roster profiles ledger:", err);
      }
    };

    initializeAppSession();
  }, []);

  useEffect(() => {
    if (activeTab === "leaderboard" && hydrated) {
      fetchLiveAccountabilityRoster();
    }
  }, [activeTab, hydrated]);

  // 🛠️ Hardware Store Inventory Matrix
  const HARDWARE_STORE_INVENTORY = [
    { id: "theme-midnight", name: "Midnight Core Glass", cost: 700, type: "Aesthetic UI Overlay", desc: "Forces deep obsidian color calibrations across grid panels." },
    { id: "theme-cyber", name: "Cyber Amber HUD", cost: 1200, type: "HUD Matrix Tint", desc: "Swaps command panel text layers into pure high-contrast performance amber." },
    { id: "streak-shield-1", name: "Streak Freeze Matrix", cost: 3000, type: "Loss Prevention Parameter", desc: "Automated streak defense. Absorbs a single calendar deadline breach event." },
    { id: "badge-alpha-founder", name: "⚡ FOUNDING OPERATOR EMBLEM", cost: 2000, type: "Cosmetic Alpha Badge", desc: "Mounts a luminous neon alpha insignia directly next to your signature monogram inside the network standings leaderboard grid." },
    { id: "badge-apex-sentinel", name: "🛡️ APEX SENTINEL VECTOR", cost: 3200, type: "Cosmetic Alpha Badge", desc: "Unlocks an animated emerald shielding shroud aura that glows behind your user canopy parameters." }
  ];

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
  const [showPlanSuccessAlert, setShowPlanSuccessAlert] = useState(false);

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

 // ☀️ MORNING CHECK-IN TRIGGER ENGINE (SIGN-IN & TIME WINDOW VERIFIED)
 useEffect(() => {
  if (!hydrated) return;

  const checkMorningCheckinEligibility = async () => {
    if (typeof window !== "undefined") {
      const { data: { user } } = await supabase.auth.getUser();
      // Skip check-in if user is NOT signed in or is a brand-new user undergoing onboarding
      if (!user) return;
      
      const isFreshSignup = localStorage.getItem("apex-tutorial-completed") !== "true";
      if (isFreshSignup) return;

      const today = todayKey();
      const lastSeen = localStorage.getItem("apexmission-morning-checkin");
      
      const currentHour = new Date().getHours();
      const isMorningWindow = currentHour >= 5 && currentHour < 12;
      
      // Redirect only if it's 5:00 AM - 12:00 PM and they haven't completed check-in today
      if (lastSeen !== today && isMorningWindow) {
        navigate({ to: "/MorningCheckIn" });
      }
    }
  };

  checkMorningCheckinEligibility();
}, [hydrated, navigate]);

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

  // 📉 ACCELERATED INTEL LOSS DEGRADATION MATRIX (Loss Aversion Engine)
  useEffect(() => {
    if (!hydrated) return;
  
    const executePenaltyAudit = async () => {
      const highImpactTasks = state.tasks?.high || [];
      const pendingHighCount = highImpactTasks.filter(t => !t.done).length;
  
      if (pendingHighCount > 0) {
        const penaltyAmount = pendingHighCount * 15;
        const targetCurrentPoints = (state as any).points || 0;
        const optimizedPoints = Math.max(0, targetCurrentPoints - penaltyAmount);

        setState((s) => ({ ...s, points: optimizedPoints }));

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ 
              points: optimizedPoints,
              operational_status: "FALLEN",
              last_action_logged: `Deducted ${penaltyAmount} credits due to active operational slacking metrics.`
            })
            .eq("id", user.id);
        }

        if (typeof window !== "undefined") {
          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              const audioCtx = new AudioContextClass();
              const osc = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              
              osc.type = "sawtooth";
              osc.frequency.setValueAtTime(290, audioCtx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.4);
              
              gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
              
              osc.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              
              osc.start();
              osc.stop(audioCtx.currentTime + 0.4);
            }
          } catch (audioErr) {
            console.warn("Audio node context blocked by browser gesture guard lines:", audioErr);
          }

          setSurpriseLoot({
            active: true,
            msg: `📉 COGNITIVE PENALTY ENFORCED: Lost ${penaltyAmount} credits. AI tracking flagged sustained slacking parameters. Leaderboard synced.`,
            points: -penaltyAmount
          });
          setTimeout(() => setSurpriseLoot(null), 4500);
        }
      }
    };
  
    const penaltyTimer = setInterval(executePenaltyAudit, 3600000);
    return () => clearInterval(penaltyTimer);
  }, [hydrated, state.tasks?.high]);
  
  // 🔄 AUTOMATED LOGIN TELEMETRY SCANNER LAYER WITH INTEGRATED WELCOME CHIME
  useEffect(() => {
    if (hydrated && !hasTriggeredAutoBrief && state && currentUserId) {
      setHasTriggeredAutoBrief(true);
      
      if (typeof window !== "undefined") {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;
            const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
            notes.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(freq, now + idx * 0.05);
              gain.gain.setValueAtTime(0.04, now + idx * 0.05);
              gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(now + idx * 0.05);
              osc.stop(now + idx * 0.05 + 0.4);
            });
          }
        } catch (audioErr) {
          console.warn("Welcome chime deferred by client interaction safeguards:", audioErr);
        }
      }
      
      setTimeout(() => {
        const coachChannel = (window as any).__apex_coach_trigger;
        if (typeof coachChannel === "function") {
          const isFreshSignup = localStorage.getItem("apex-tutorial-completed") !== "true";
          if (isFreshSignup) {
            coachChannel("[SYSTEM_AUTO_TRIGGER_SIGNUP_ONBOARDING_GUIDE]");
          } else {
            coachChannel("[SYSTEM_AUTO_TRIGGER_LOGIN_BRIEFING]");
          }
        }
      }, 500);
    }
  }, [hydrated, state, hasTriggeredAutoBrief, currentUserId]);

  function handleGoToNightReflection() {
    navigate({ to: "/night-reflection" });
  }

  const [formattedDate] = useState(() => {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    return `${month}. ${dayNum}${suffix} ${year}`;
  });

  const themeClasses = useMemo(() => {
    switch (activeLayoutTheme) {
      case "theme-midnight":
        return {
          bg: "bg-[#040406] text-zinc-100",
          card: "bg-[#09090D] border-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.01)] backdrop-blur-md",
          border: "border-zinc-900/60",
          accent: "text-emerald-400 bg-emerald-950/20 border-emerald-500/20",
          glow: "shadow-[0_0_15px_rgba(16,185,129,0.15)] bg-emerald-400"
        };
      case "theme-cyber":
        return {
          bg: "bg-[#0A0700] text-amber-100 font-mono",
          card: "bg-[#140D00] border-amber-500/20 shadow-[0_0_50px_rgba(245,158,11,0.02)] border-dashed",
          border: "border-amber-900/40",
          accent: "text-amber-500 bg-amber-950/40 border-amber-500/30 font-black",
          glow: "shadow-[0_0_20px_rgba(245,158,11,0.25)] bg-amber-500"
        };
      default:
        return {
          bg: "bg-black text-zinc-100",
          card: "bg-[#0D0D11] border-zinc-800 shadow-xl",
          border: "border-zinc-800",
          accent: "text-emerald-400 bg-emerald-950/20 border-emerald-500/10",
          glow: "shadow-[0_0_10px_rgba(52,211,153,0.3)] bg-emerald-400"
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
          high: plan.high.map((text: string) => ({ id: nextId(), text, done: false })),
          medium: plan.medium.map((text: string) => ({ id: nextId(), text, done: false })),
          low: plan.low.map((text: string) => ({ id: nextId(), text, done: false })),
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
    setState((s) => {
      const currentTasks = s.tasks[tier] || [];
      const targetTask = currentTasks.find(t => t.id === id);
      const targetCompleting = targetTask ? !targetTask.done : false;

      let scoreBonus = 0;
      let rewardNotice = "";
      
      if (targetCompleting) {
        const activeStreak = s.streak?.count || 0;
        const streakMultiplier = 1 + (activeStreak * 0.1); 
        const baseTaskPoints = 50;
        
        const totalMultipliedPoints = Math.round(baseTaskPoints * streakMultiplier);
        scoreBonus += totalMultipliedPoints;

        if (activeStreak >= 7) {
          rewardNotice = `⚡ STREAK MULTIPLIER ACTIVE (${streakMultiplier.toFixed(1)}x): Earned ${totalMultipliedPoints} credits for task execution!`;
        }

        const randomRoll = Math.random();
        if (randomRoll > 0.85) {
          const criticalBonus = Math.round(250 * streakMultiplier);
          scoreBonus += criticalBonus;
          rewardNotice = `🔥 CRITICAL BOOTSTRAP BONUS UNLOCKED: Infused +${criticalBonus} extra credits into your matrix!`;
        }

        if (typeof window !== "undefined") {
          try {
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
              const ctx = new AudioCtxClass();
              const osc1 = ctx.createOscillator();
              const gain1 = ctx.createGain();
              osc1.type = "sine";
              osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
              gain1.gain.setValueAtTime(0.04, ctx.currentTime);
              gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
              osc1.connect(gain1);
              gain1.connect(ctx.destination);
              osc1.start();
              osc1.stop(ctx.currentTime + 0.12);

              setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = "sine";
                osc2.frequency.setValueAtTime(880.00, ctx.currentTime);
                gain2.gain.setValueAtTime(0.05, ctx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start();
                osc2.stop(ctx.currentTime + 0.25);
              }, 60);
            }
          } catch (audioErr) {
            console.warn("Audio node context deferred by client browser interaction guard lines:", audioErr);
          }
        }
      }

      if (rewardNotice) {
        setSurpriseLoot({ active: true, msg: rewardNotice, points: scoreBonus });
        setTimeout(() => setSurpriseLoot(null), 4500);
      }

      return {
        ...s,
        points: Math.max(0, ((s as any).points || 0) + scoreBonus),
        tasks: {
          ...s.tasks,
          [tier]: currentTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        },
      };
    });
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
      let scoreBonus = nextDone ? 200 : 0;

      if (nextDone) {
        const currentCount = updatedStreak.count;
        
        if (currentCount > 0 && currentCount % 7 === 0) {
          const dynamicMilestonePayoff = (currentCount / 7) * 1000;
          scoreBonus += dynamicMilestonePayoff;
          
          setTimeout(() => {
            setSurpriseLoot({
              active: true,
              msg: `🏆 ELITE ${currentCount}-DAY CONSISTENCY ACHIEVEMENT SECURED! Your console node has been infused with an advanced +${dynamicMilestonePayoff.toLocaleString()} credit milestone payoff bundle.`,
              points: dynamicMilestonePayoff
            });
          }, 300);
        }

        setTimeout(() => setShowMilestoneCelebration(currentCount), 300);
      }

      return {
        ...s,
        points: Math.max(0, ((s as any).points || 0) + scoreBonus),
        daily: { ...s.daily, done: nextDone, date: todayKey() },
        streak: updatedStreak
      };
    });

    if (nextDone && typeof window !== "undefined") {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const audioCtx = new AudioCtxClass();
          
          const osc1 = audioCtx.createOscillator();
          const gain1 = audioCtx.createGain();
          osc1.type = "sine";
          osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
          gain1.gain.setValueAtTime(0.06, audioCtx.currentTime);
          gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
          osc1.connect(gain1);
          gain1.connect(audioCtx.destination);
          osc1.start();
          osc1.stop(audioCtx.currentTime + 0.2);

          setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
            gain2.gain.setValueAtTime(0.06, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.35);
          }, 70);

          setTimeout(() => {
            const osc3 = audioCtx.createOscillator();
            const gain3 = audioCtx.createGain();
            osc3.type = "sine";
            osc3.frequency.setValueAtTime(783.99, audioCtx.currentTime);
            gain3.gain.setValueAtTime(0.07, audioCtx.currentTime);
            gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc3.connect(gain3);
            gain3.connect(audioCtx.destination);
            osc3.start();
            osc3.stop(audioCtx.currentTime + 0.5);
          }, 140);
        }
      } catch (err) {
        console.warn("Audio Context blocked by client gesture locks:", err);
      }
    }

    if (nextDone) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 500);
    }
  }

  return (
    <div className={`min-h-screen transition-all duration-500 ease-in-out ${themeClasses.bg} text-zinc-100 flex overflow-hidden animate-scan-line`}>
      
      {/* 🧭 LEFT SIDEBAR NAVIGATION BAR */}
      <aside className="w-64 border-r border-emerald-500/10 bg-[#07070A] flex flex-col justify-between p-4 shrink-0 z-20">
        <div className="flex flex-col gap-6">
          {/* Brand Logo Header */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <Target className="size-5 animate-pulse" />
            </div>
            <div className="text-left">
              <span className="font-black text-sm font-display tracking-[0.2em] text-white uppercase block">ApexMission</span>
              <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-wider block mt-0.5">Command Terminal</span>
            </div>
          </div>

          {/* Navigation Links List */}
          <nav className="flex flex-col gap-1.5 font-mono text-xs font-black uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setActiveTab("workspace")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "workspace"
                  ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] font-black"
                  : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
              }`}
            >
              <LayoutDashboard className="size-4" />
              <span>Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "leaderboard"
                  ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] font-black"
                  : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
              }`}
            >
              <Award className="size-4" />
              <span>Ranks</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("hardware")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "hardware"
                  ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] font-black"
                  : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
              }`}
            >
              <HardDrive className="size-4" />
              <span>Hardware</span>
            </button>
          </nav>
        </div>

        {/* Support Option Footer Button */}
        <div className="border-t border-zinc-900 pt-4">
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3 text-xs font-bold text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200 font-mono uppercase tracking-wider"
          >
            <HelpCircle className="size-4 text-emerald-500" />
            <span>Support</span>
          </button>
        </div>
      </aside>

      {/* 🚀 MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto relative z-10 px-6 py-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

          {/* ⚡ FLOATING EMERALD NOTIFICATION BANNER */}
          {showPlanSuccessAlert && (
            <div className="fixed top-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-[#0E1612]/95 px-5 py-4 flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.15)] backdrop-blur-md animate-fade-in">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-black">
                <Check className="size-4 stroke-[3]" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">Blueprint Initialized</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">Mission parameter metrics, tasks, and daily actions extracted perfectly.</p>
              </div>
            </div>
          )}

          {/* 🖥️ TOP DASHBOARD HEADER */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-emerald-950/5 border border-emerald-500/10 p-4 rounded-xl backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
            
            {/* Operator Node Badge + Restored Today Date Ticker */}
            <div className="flex items-center gap-3">
              <div className="text-left">
                <span className="text-xs font-black text-white uppercase block">Operator: {userName}</span>
                <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider block mt-0.5 font-mono">
                  📅 {formattedDate}
                </span>
              </div>
            </div>

            {/* Right System Controls & Metrics */}
            <div className="flex items-center gap-2 justify-end font-mono">
              <div className="text-[10px] font-black bg-black/40 border border-emerald-500/20 px-3 py-2 rounded-lg flex items-center gap-1.5 text-emerald-400 shadow-[inset_0_1px_2px_rgba(52,211,153,0.1)]">
                <Shield className="size-3.5 text-emerald-400 fill-emerald-400/10" />
                <span>{state?.points || 0} Credits</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAnalyticsModal(true)}
                className="rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500 hover:text-black transition-all duration-300"
              >
                📈 Metrics
              </button>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  localStorage.removeItem("apex-tutorial-completed");
                  navigate({ to: "/auth" });
                }}
                title="Disconnect Node"
                className="rounded-lg border border-rose-500/20 bg-rose-950/30 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-rose-400 hover:border-rose-500/50 hover:bg-rose-500 hover:text-black transition-all duration-300"
              >
                🔌 Disconnect
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm("⚠️ SYSTEM FLASH RESET: Wipe active local operational data?")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                title="Flush Cache Matrix"
                className="rounded-lg border border-amber-500/20 bg-amber-950/30 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-amber-400 hover:border-amber-500/50 hover:bg-amber-500 hover:text-black transition-all duration-300"
              >
                🧹 Flush Cache
              </button>
            </div>
          </header>

          {/* WORKSPACE TAB */}
          {activeTab === "workspace" && (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* Vision Card */}
              <section className="relative overflow-hidden rounded-2xl border p-6 sm:p-8 emerald-glass-core">
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

              {/* Profile Selector */}
              <div className="flex items-center gap-3 bg-[#0D0D11]/90 border border-zinc-800 rounded-xl p-3 text-left emerald-glass-panel">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 whitespace-nowrap pl-1">Audience Profile Track:</span>
                <select 
                  defaultValue="general"
                  onChange={(e) => {
                    const selectedTrack = e.target.value as keyof typeof AUDIENCE_PROFILES;
                    const profileDefaults = AUDIENCE_PROFILES[selectedTrack];
                    
                    if (window.confirm(`⚡ SYNCHRONIZE TRACK PROFILE: Clear current workspace grids and auto-load baseline execution rows for the ${e.target.options[e.target.selectedIndex].text} matrix?`)) {
                      setState((s) => ({
                        ...s,
                        tasks: {
                          high: [{ id: `t-${Date.now()}-h`, text: profileDefaults.high, done: false }],
                          medium: [{ id: `t-${Date.now()}-m`, text: profileDefaults.medium, done: false }],
                          low: [{ id: `t-${Date.now()}-l`, text: profileDefaults.low, done: false }]
                        }
                      }));
                      alert("🚀 ARCHITECTURE MATRIX LOADED: Baseline task sequences injected cleanly.");
                    }
                  }}
                  className="bg-black border border-zinc-900 rounded-lg h-9 px-3 text-xs font-bold text-emerald-400 outline-none focus:border-zinc-800 cursor-pointer w-full"
                >
                  <option value="general">💼 Professional Standard Track</option>
                  <option value="ceo">🚀 Chief Executive Officer (CEO)</option>
                  <option value="corporate">🏢 Corporate Operational Track</option>
                  <option value="university">🎓 University/College Scholar Matrix</option>
                  <option value="student">🏫 High School Student Vector</option>
                </select>
              </div>

              {/* Task Columns */}
              <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
                {TIERS.map((tier) => (
                  <div key={tier.key} className="flex flex-col rounded-2xl p-5 emerald-glass-panel">
                    <div className="flex flex-col gap-2 border-b border-zinc-900/60 pb-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${tier.accentClass}`} />
                        <h2 className={`text-[10px] font-black tracking-widest uppercase ${tier.textClass}`}>
                          {tier.label}
                        </h2>
                        <span className="ml-auto font-mono text-[10px] font-bold bg-black border border-zinc-900 px-2 py-0.5 rounded text-zinc-400 tabular-nums">
                          {(state.tasks[tier.key] || []).filter((t) => t.done).length}/{(state.tasks[tier.key] || []).length}
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-mono text-[9px] text-zinc-600 uppercase mt-0.5">
                        <span>Cutoff Vector Window:</span>
                        <span className="text-zinc-400 font-bold tracking-wider tabular-nums animate-pulse">
                          {resetMs === null ? "00:00:00" : formatCountdown(resetMs)}
                        </span>
                      </div>
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

                    <div className="mt-3 flex items-center gap-2 rounded-xl px-3 glass-input-node">
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

              {/* Daily Action */}
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

                {isEvening && (
                  <div className="w-full max-w-md mx-auto mb-6 p-1">
                    <button
                      onClick={handleGoToNightReflection}
                      className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl border p-4 bg-gradient-to-r from-[#060D08] to-black transition-all duration-400 border-emerald-500/10 hover:border-emerald-500/40 hover:shadow-[0_0_25px_rgba(16,185,129,0.1)]"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/10 bg-emerald-950/30 text-emerald-400 transition-colors duration-300 group-hover:border-emerald-500/30">
                          <span className="text-sm">🌙</span>
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500/70">Day Closeout</p>
                          <h4 className="text-xs font-bold text-zinc-200 group-hover:text-white uppercase font-mono tracking-wide">Win Your Night</h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 transition-colors group-hover:text-emerald-400 relative z-10 font-mono">
                        <span>Lock in Progress</span>
                        <span className="transform transition-transform duration-300 group-hover:translate-x-1">→</span>
                      </div>
                    </button>
                  </div>
                )}

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
          )}

          {/* RANKS LEADERBOARD TAB */}
          {activeTab === "leaderboard" && (
            <section className={`rounded-2xl border p-6 text-left transform transition-all duration-500 translate-y-2 animate-fade-in ${themeClasses.card} emerald-glass-panel`}>  
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4 mb-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Trophy className="size-4 text-amber-400" /> Real-Time Network Operator Standings
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">Cross-examine absolute consistency vectors. Only real authenticated system operators currently mapped to this network cluster are displayed.</p>
                </div>
                
                <button
                  type="button"
                  disabled={loadingRoster}
                  onClick={fetchLiveAccountabilityRoster}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black/40 px-3 py-1.5 font-mono text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors"
                >
                  {loadingRoster ? <Loader2 className="size-3 animate-spin text-emerald-400" /> : "🔄 Resync Ledger"}
                </button>
              </div>
              
              <div className="overflow-hidden rounded-xl border border-zinc-900 bg-black/20 font-mono text-xs">
                <div className="grid grid-cols-6 bg-zinc-950/80 px-4 py-3 text-[9px] font-black uppercase tracking-wider text-zinc-500 border-b border-zinc-900 text-center sm:text-left">
                  <span>Rank</span>
                  <span className="text-left">Operator Node</span>
                  <span className="text-center">Current</span>
                  <span className="text-center">Max Peak</span>
                  <span className="text-center">Failures / HUD</span>
                  <span className="text-right">Credit Balance</span>
                </div>

                <div className="divide-y divide-zinc-900/60">
                  {leaderboardOperators.map((operator, index) => {
                    const isCurrentClientNode = operator.id === (supabase.auth.getUser() as any)?.data?.user?.id;
                    const activeDisplayCredits = isCurrentClientNode 
                      ? ((state as any).points !== undefined ? (state as any).points : 1000) 
                      : (operator.points || operator.beta_points || 0);

                    const hasFounderBadge = isCurrentClientNode 
                      ? localStorage.getItem("apexmission-unlocked-badge-alpha-founder") === "true"
                      : operator.unlocked_layouts?.includes("badge-alpha-founder");

                    return (
                      <div 
                        key={operator.id} 
                        className={`grid grid-cols-6 px-4 py-4 items-center text-center sm:text-left text-zinc-300 transition-colors duration-200 hover:bg-zinc-900/10 ${
                          isCurrentClientNode ? "bg-emerald-950/10 text-emerald-400 font-bold border-y border-emerald-500/20" : ""
                        }`}
                      >
                        <span className="font-bold text-zinc-500">
                          {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${String(index + 1).padStart(2, "0")}`}
                        </span>
                        
                        <span className="truncate font-semibold text-white text-left flex items-center gap-2 min-w-0">
                          <span className="truncate">{operator.full_name || "Anonymous Operator"}</span>
                          
                          {hasFounderBadge && (
                            <span className="shrink-0 text-[8px] font-black tracking-widest text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse">
                              ⚡ FOUNDER
                            </span>
                          )}

                          {isCurrentClientNode && <span className="shrink-0 text-[8px] tracking-widest uppercase bg-emerald-950 border border-emerald-500/30 text-emerald-400 px-1 rounded">YOU</span>}
                        </span>
                        
                        <span className="text-center text-orange-400 font-bold tabular-nums">{operator.current_streak}d</span>
                        <span className="text-center text-amber-500 font-bold tabular-nums">{operator.max_streak}d</span>
                        
                        <span className="text-center flex flex-col sm:flex-row items-center justify-center gap-1">
                          <span className="text-rose-400 font-semibold tabular-nums bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-500/10">{operator.failure_count}</span>
                          <span className={`text-[8px] font-black uppercase px-1 rounded tracking-wide border ${
                            operator.operational_status === "Operational" 
                              ? "bg-emerald-950/30 text-emerald-500 border-emerald-500/20" 
                              : "bg-rose-950/30 text-rose-500 border-rose-500/20 animate-pulse"
                          }`}>
                            {operator.operational_status}
                          </span>
                        </span>
                        
                        <span className="text-right text-emerald-400 font-bold font-mono tabular-nums">{activeDisplayCredits} cr</span>
                      </div>
                    );
                  })}

                  {leaderboardOperators.length === 0 && (
                    <div className="p-8 text-center text-zinc-600 italic">
                      {loadingRoster ? "Establishing network stream channels..." : "No active profiles discovered inside network cluster parameters."}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* HARDWARE MARKET TAB */}
          {activeTab === "hardware" && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in text-left">
              {HARDWARE_STORE_INVENTORY.map((item) => (
                <div key={item.id} className={`flex flex-col justify-between rounded-2xl border p-5 ${themeClasses.card} bg-zinc-950/20`}>
                  <div>
                    <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-500 tracking-wider w-max block">{item.type}</span>
                    <h4 className="text-sm font-black text-white mt-3">{item.name}</h4>
                    <p className="text-[11px] text-zinc-500 mt-1">{item.desc}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-emerald-400">{item.cost} credits</span>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (((state as any).points || 0) < item.cost) return alert("❌ INSUFFICIENT OPERATIONAL CREDITS.");
                        
                        setState(s => ({ ...s, points: ((s as any).points || 0) - item.cost }));
                        
                        if (item.id.startsWith("theme-")) { 
                          localStorage.setItem("apexmission-active-theme", item.id); 
                          window.location.reload(); 
                        } else if (item.id.startsWith("badge-")) {
                          localStorage.setItem(`apexmission-unlocked-${item.id}`, "true");
                          alert(`💎 ALPHA COGNITIVE EMBLEM EQUIPPED: ${item.name} is now locked onto your identity matrix rows!`);
                          window.location.reload();
                        }
                      }} 
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 font-mono shadow-md shadow-emerald-500/10 transition-all active:scale-95"
                    >
                      Equip
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </main>

      {/* OVERLAY MODALS & COMPONENTS */}
      {surpriseLoot && (
        <div className="fixed bottom-6 left-72 z-40 rounded-xl border border-emerald-500/20 bg-[#0E1612]/90 p-4 text-left flex items-center gap-3 text-xs font-bold text-emerald-400 border-l-4 border-l-emerald-500 animate-fade-in shadow-2xl">
          <Sparkles className="size-4 animate-spin shrink-0" />
          <span>{surpriseLoot.msg}</span>
        </div>
      )}

      <PaywallModal
        open={paywall !== null}
        reason={paywall ?? ""}
        onClose={() => setPaywall(null)}
        onUpgrade={handleUpgrade}
      />

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

      {/* MISSION COACH COMPONENT */}
      <MissionCoach
        premium={premium}
        state={state}
        userName={userName}
        userRank={userRankText}
        onLockedHistory={() => setPaywall("Your full coach history is a premium feature...")}
        onActionPlanGenerated={(plan) => {
          setState((s) => ({
            ...s,
            userName: userName,
            mission: plan.mission || s.mission,
            tasks: {
              high: (plan.high || []).map((text: string) => ({ id: nextId(), text, done: false })),
              medium: (plan.medium || []).map((text: string) => ({ id: nextId(), text, done: false })),
              low: (plan.low || []).map((text: string) => ({ id: nextId(), text, done: false })),
            },
            daily: { text: plan.dailyAction || "", done: false, date: todayKey() },
          }));
          setDailyDraft(plan.dailyAction || "");
          setShowPlanSuccessAlert(true);
          setTimeout(() => setShowPlanSuccessAlert(false), 4000);
        }}
      />

      {/* SUPPORT MODAL */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 text-left shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Support & Feedback
              </h3>
              <button
                onClick={() => setShowSupport(false)}
                className="text-zinc-500 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              Found a bug, have a suggestion, or need help? Send an email for support.
            </p>

            <div className="rounded-xl border border-zinc-800 bg-black/40 px-4 py-3 mb-5">
              <p className="text-xs text-zinc-500">
                Replies are sent within <span className="text-emerald-400 font-semibold">1–4 business days</span>.
              </p>
            </div>

            <a
              href="mailto:support@apexmissions.app?subject=ApexMission Support / Feedback"
              className="flex w-full items-center justify-center rounded-xl bg-white py-3 text-sm font-bold text-black transition-all hover:bg-emerald-400"
              onClick={() => setShowSupport(false)}
            >
              Email support@apexmissions.app →
            </a>
          </div>
        </div>
      )}

      {/* METRICS VISUALIZER MODAL */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md animate-fade-in text-left font-mono">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0A0A0F] p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
            
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">📈 Velocity Consistency Index</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wide">7-Cycle Historical Metric Telemetry</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAnalyticsModal(false)}
                className="size-7 rounded-lg border border-zinc-900 bg-black text-zinc-500 hover:text-white flex items-center justify-center font-bold text-xs"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              <div className="h-44 w-full bg-black/40 rounded-xl border border-zinc-900/60 p-4 flex items-end justify-between gap-2.5 relative">
                <div className="absolute left-0 right-0 top-1/4 h-px border-t border-zinc-900/30 border-dashed" />
                <div className="absolute left-0 right-0 top-2/4 h-px border-t border-zinc-900/30 border-dashed" />
                <div className="absolute left-0 right-0 top-3/4 h-px border-t border-zinc-900/30 border-dashed" />

                {[
                  { day: "Mon", val: 40, color: "bg-emerald-950/40 border-emerald-500/20 text-emerald-400" },
                  { day: "Tue", val: 65, color: "bg-emerald-900/40 border-emerald-400/20 text-emerald-400" },
                  { day: "Wed", val: 20, color: "bg-rose-950/40 border-rose-500/30 text-rose-400 animate-pulse" },
                  { day: "Thu", val: 85, color: "bg-emerald-800/40 border-emerald-400/30 text-emerald-300" },
                  { day: "Fri", val: 100, color: "bg-gradient-to-t from-emerald-600 to-emerald-400 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] text-white" },
                  { day: "Sat", val: 50, color: "bg-emerald-900/30 border-emerald-600/10 text-emerald-500" },
                  { day: "Sun", val: progress, color: "bg-gradient-to-t from-teal-600 to-teal-400 border-teal-300 shadow-[0_0_15px_rgba(45,212,191,0.2)] text-white" },
                ].map((bar, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end relative z-10">
                    <span className="text-[9px] font-mono font-black tabular-nums text-emerald-400/90">{bar.val}%</span>
                    <div 
                      className={`w-full rounded-t-md transition-all duration-1000 border-t ${bar.color}`}
                      style={{ height: `${Math.max(8, bar.val * 0.72)}%` }}
                    />
                    <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mt-1">{bar.day}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/20 p-3.5 space-y-2 text-[11px] text-zinc-400 leading-relaxed">
                <p className="flex items-center justify-between"><span className="text-zinc-600 uppercase font-bold text-[9px]">Calculated Output Vector:</span> <span className="text-zinc-200 font-bold">Stable Momentum</span></p>
                <p className="flex items-center justify-between"><span className="text-zinc-600 uppercase font-bold text-[9px]">Current Cycle Progress:</span> <span className="text-emerald-400 font-bold tabular-nums">+{progress}% Velocity</span></p>
                <p className="text-zinc-500 border-t border-zinc-900/60 pt-2 mt-2 italic text-[10px]">
                  💡 STRATEGIC ADVISORY: Wednesday parameters registered an unexecuted bottleneck fault deviation loop. Maintain your Friday and Sunday momentum paths to absorb further credit degradation values.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAnalyticsModal(false)}
              className="w-full h-11 rounded-xl bg-emerald-500 text-xs font-black uppercase tracking-wider text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.35)] font-mono mt-6"
            >
              Close Metrics Overview
            </button>
          </div>
        </div>
      )}
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

export const AUDIENCE_PROFILES = {
  ceo: {
    high: "Capital Allocation / Executive Hirings",
    medium: "Cross-Department Alignment Sweeps",
    low: "Ebox Sorting / Calendar Curation"
  },
  corporate: {
    high: "High-Priority Deliverables / QBR Decks",
    medium: "Cross-Functional Sync Intercepts",
    low: "Timesheet Logging / Jira Grooming"
  },
  university: {
    high: "Thesis Writing / Core Lab Code",
    medium: "Lecture Curation & Problem Sheets",
    low: "Internship Grid Submissions"
  },
  student: {
    high: "SAT Prep / Mastery Term Studies",
    medium: "Extracurricular Documentation",
    low: "Daily Homework Form Submission"
  },
  general: {
    high: "Higher Leverage Strategy Focus Target",
    medium: "Secondary Support Sub-Task Node",
    low: "General Routine Maintenance Item"
  }
};

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