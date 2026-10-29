import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Flame, Plus, Sparkles, Loader2, Target, TimerReset, Shield, Trophy, LayoutDashboard, Award, HardDrive, HelpCircle, MessageSquare, Building2 } from "lucide-react";
import { PaywallModal } from "@/components/PaywallModal";
import { MissionCoach } from "@/components/MissionCoach";
import { OperatorInduction } from "@/components/OperatorInduction";
import { TacticalBriefing } from "@/components/TacticalBriefing";
import {
  computeAverageCompletionsPerDay,
  fetchLeaderboardTelemetry,
  fetchOperatorProfileMetadata,
  TACTICAL_BRIEFING_SESSION_KEY,
  type BehaviorAnalytics,
  type LeaderboardSnapshot,
  type OperatorProfileMetadata,
} from "@/lib/synthetic-briefing";
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
import { extractSubdomainSlug, PLATFORM_APP_URL, TENANT_ROOT_DOMAIN } from "@/lib/tenant-host";
import { resolveActiveTenant, type SessionTenant } from "@/lib/tenant.functions";
import {
  clearCurrentUserStorage,
  getScopedItem,
  setScopedItem,
  setStorageScope,
} from "@/lib/user-storage";

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
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"workspace" | "leaderboard" | "hardware">("workspace");
  const mainRef = useRef<HTMLElement | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [showInduction, setShowInduction] = useState(false);
  const [showTacticalBriefing, setShowTacticalBriefing] = useState(false);
  const [surpriseLoot, setSurpriseLoot] = useState<{ active: boolean; msg: string; points: number } | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<OperatorProfileMetadata | null>(null);
  const [leaderboardSnapshot, setLeaderboardSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [activeTenant, setActiveTenant] = useState<SessionTenant | null>(null);
  const [behaviorAnalytics, setBehaviorAnalytics] = useState<BehaviorAnalytics>({
    sessionCount: 0,
    lastSessionDate: "",
    totalTasksCompleted: 0,
    averageCompletionTime: 0,
    procrastinationEvents: 0,
    peakProductivityHour: 12,
    totalMessagesExchanged: 0,
    streakConsistency: 0,
    preferredFocusAreas: [],
    taskHistory: [],
  });

  // The coach penalises slacking from inside its own component; listen for its
  // debit so the header balance and the next local save stay consistent.
  useEffect(() => {
    const handlePointsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ points?: unknown }>).detail;
      if (detail && typeof detail.points === "number") {
        setState((current) => ({ ...current, points: detail.points as number }));
      }
    };

    window.addEventListener("apexmission:points-updated", handlePointsUpdated);
    return () => {
      window.removeEventListener("apexmission:points-updated", handlePointsUpdated);
    };
  }, []);

  const userRankIndex = leaderboardOperators.findIndex(op => op.id === currentUserId);
  const userRankText = useMemo(() => {
    if (leaderboardOperators.length === 0) return "Global Operator Node";
    return userRankIndex !== -1 
      ? `#${userRankIndex + 1} of ${leaderboardOperators.length} Operators` 
      : `Unranked (${leaderboardOperators.length} Active Operators)`;
  }, [userRankIndex, leaderboardOperators]);

  const userFailureCount = useMemo(() => {
    const currentUser = leaderboardOperators.find(op => op.id === currentUserId);
    return currentUser?.failure_count || 0;
  }, [leaderboardOperators, currentUserId]);

  // Live real-time database query pipeline selector function
  const fetchLiveAccountabilityRoster = async () => {
    if (loadingRoster) return;
    setLoadingRoster(true);
    try {
      const { operators, snapshot } = await fetchLeaderboardTelemetry(currentUserId);
      const normalizedData = operators.map((operator) => ({
        ...operator,
        full_name: operator.operator_name,
        points: operator.credits,
      }));
      setLeaderboardOperators(normalizedData);
      setLeaderboardSnapshot(
        operatorProfile?.companyId === null ? snapshot : null,
      );
      setScopedItem("apexmission-leaderboard-cache", JSON.stringify(normalizedData));
    } catch (err) {
      console.error("Failed to map dynamic roster profiles ledger:", err);
    } finally {
      setLoadingRoster(false);
    }
  };

  // 🚀 IMMEDIATE APP SESSION, PROFILE METADATA & LEADERBOARD INITIALIZATION
  useEffect(() => {
    let cancelled = false;

    const initializeAppSession = async () => {
      try {
        // getSession reads/refreshes the local session without a network round
        // trip, so a transient getUser failure cannot bounce a valid user.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (cancelled) return;

        if (!user) {
          // Never render another account's cached dashboard data for a guest.
          setStorageScope(null);
          setHydrated(true);
          setProfileHydrated(true);
          navigate({ to: "/auth", replace: true });
          return;
        }

        // The account scope must be established before pulling any local
        // mission, chat, theme, or analytics state.
        setStorageScope(user.id);
        setCurrentUserId(user.id);

        const localState = loadState();
        if (cancelled) return;
        setState(localState);
        setDailyDraft(localState.daily.text);
        setHasGeneratedMissionPlan(
          getScopedItem("apexmission-mission-plan-generated") === "true",
        );
        setActiveLayoutTheme(getScopedItem("apexmission-active-theme") || "layout-default");

        const rawAnalytics = getScopedItem("apexmission-behavior-analytics");
        if (rawAnalytics) {
          try {
            const parsedAnalytics = JSON.parse(rawAnalytics);
            setBehaviorAnalytics((previous) => ({ ...previous, ...parsedAnalytics }));
          } catch {
            // Analytics cache is optional; the synthetic engine degrades gracefully.
          }
        }

        setHydrated(true);

        const profile = await fetchOperatorProfileMetadata(user.id);
        const metadataName =
          typeof user.user_metadata?.["full_name"] === "string"
            ? user.user_metadata["full_name"]
            : "";
        const emailHandle = user.email?.split("@")[0] || "";
        const fallbackName = metadataName || emailHandle || "Operator";
        const effectiveProfile: OperatorProfileMetadata = profile ?? {
          id: user.id,
          operatorName: fallbackName,
          companyId: null,
          onboardingCompleted: false,
          credits: 0,
          currentStreak: 0,
          maxStreak: 0,
          failureCount: 0,
          operationalStatus: "OPERATIONAL",
          lastActionLogged: "",
        };

        if (cancelled) return;
        setOperatorProfile(effectiveProfile);
        if (Array.isArray(effectiveProfile.taskHistory)) {
          setBehaviorAnalytics((prev) => ({
            ...prev,
            taskHistory: effectiveProfile.taskHistory ?? [],
          }));
        }
        setUserName(toDisplayName(effectiveProfile.operatorName));
        setState((current) => ({
          ...current,
          points: effectiveProfile.credits,
        }));

        // Wildcard host -> company tenant. Only reached on tenant subdomains;
        // the server function reads the trusted x-subdomain-slug header.
        const hostSlug =
          typeof window !== "undefined"
            ? extractSubdomainSlug(window.location.hostname)
            : null;

        if (hostSlug) {
          try {
            const tenant = await resolveActiveTenant();
            if (!cancelled) setActiveTenant(tenant);
          } catch (error) {
            console.error("Tenant context resolution failed:", error);
          }
        }

        const { operators, snapshot } = await fetchLeaderboardTelemetry(user.id);
        const normalizedData = operators.map((operator) => ({
          ...operator,
          full_name: operator.operator_name,
          points: operator.credits,
        }));

        if (cancelled) return;
        setLeaderboardOperators(normalizedData);
        // Personal operators receive live rank intelligence. Corporate
        // operators never receive leaderboard telemetry in the engine.
        setLeaderboardSnapshot(
          effectiveProfile.companyId === null ? snapshot : null,
        );
        setScopedItem("apexmission-leaderboard-cache", JSON.stringify(normalizedData));
      } catch (err) {
        console.error("Failed to map dynamic operator telemetry:", err);
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setProfileHydrated(true);
        }
      }
    };

    initializeAppSession();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleOnboardingComplete = async () => {
    // Flip the UI immediately, then persist the permanent database flag.
    setOperatorProfile((current) =>
      current ? { ...current, onboardingCompleted: true } : current,
    );

    if (!currentUserId) return;

    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", currentUserId);

    if (error) {
      console.error("Failed to persist onboarding_completed flag:", error);
      return;
    }

    setScopedItem("apex-tutorial-completed", "true");
  };

  const completeInduction = async () => {
    setShowInduction(false);

    // Do not stack the returning-login dossier directly behind the induction.
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(TACTICAL_BRIEFING_SESSION_KEY, "true");
      }
    } catch {
      // Session storage can be unavailable in private contexts.
    }

    await handleOnboardingComplete();
  };

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

  const [isGeneratingMissionPlan, setIsGeneratingMissionPlan] = useState(false);
  const checkout = useServerFn(startCheckout);
  const [hasGeneratedMissionPlan, setHasGeneratedMissionPlan] = useState(false);

  const [isEvening, setIsEvening] = useState(false);

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
  if (!hydrated || !profileHydrated) return;

  const checkMorningCheckinEligibility = async () => {
    if (typeof window !== "undefined") {
      // The database onboarding flag is authoritative. Never interrupt the
      // first-ever session with the morning check-in ritual.
      if (!operatorProfile?.onboardingCompleted) return;

      const today = todayKey();
      const lastSeen = getScopedItem("apexmission-morning-checkin");
      
      const currentHour = new Date().getHours();
      const isMorningWindow = currentHour >= 5 && currentHour < 12;
      
      if (lastSeen !== today && isMorningWindow) {
        navigate({ to: "/MorningCheckIn" });
      }
    }
  };

  checkMorningCheckinEligibility();
}, [hydrated, profileHydrated, operatorProfile, navigate]);

  useEffect(() => {
    const applyEvening = () => {
      const currentHour = new Date().getHours();
      setIsEvening(currentHour >= 18 || currentHour < 1);
    };
    applyEvening();
    const timer = setInterval(applyEvening, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeLayout = getScopedItem("apexmission-active-theme") || "layout-default";
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
              credits: optimizedPoints,
              operational_status: "FALLEN",
              last_action_logged: `Deducted ${penaltyAmount} credits due to active operational slacking metrics.`
            })
            .eq("id", user.id);
        }

        setSurpriseLoot({
          active: true,
          msg: `📉 COGNITIVE PENALTY ENFORCED: Lost ${penaltyAmount} credits. AI tracking flagged sustained slacking parameters. Leaderboard synced.`,
          points: -penaltyAmount
        });
        setTimeout(() => setSurpriseLoot(null), 4500);
      }
    };

    const penaltyTimer = setInterval(executePenaltyAudit, 3600000);
    return () => clearInterval(penaltyTimer);
  }, [hydrated, state.tasks?.high, setState]);
  
  // 🎯 DETERMINISTIC SESSION ENTRY — LOCAL INDUCTION OR TACTICAL DOSSIER
  useEffect(() => {
    if (!hydrated || !profileHydrated || !operatorProfile) return;

    // First session: the database onboarding flag is authoritative. Show the
    // deterministic induction wizard, never the coach chat.
    if (!operatorProfile.onboardingCompleted) {
      setShowInduction(true);
      return;
    }

    // Returning login: open the locally generated dossier at most once per
    // browser session. No AI request is made.
    let alreadyShown = false;
    try {
      alreadyShown =
        sessionStorage.getItem(TACTICAL_BRIEFING_SESSION_KEY) === "true";
      if (!alreadyShown) {
        sessionStorage.setItem(TACTICAL_BRIEFING_SESSION_KEY, "true");
      }
    } catch {
      // Storage can be unavailable in private contexts; still show once.
    }

    if (alreadyShown) return;

    const timer = window.setTimeout(() => setShowTacticalBriefing(true), 900);
    return () => window.clearTimeout(timer);
  }, [hydrated, profileHydrated, operatorProfile]);

  function handleGoToNightReflection() {
    navigate({ to: "/night-reflection" });
  }

  // Reset both possible scrollers when switching tabs so a new view never
  // opens halfway down the previous tab's content on phones or tablets.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

  const [formattedDate, setFormattedDate] = useState("");

  useEffect(() => {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const suffix = getOrdinalSuffix(dayNum);
    const year = now.getFullYear();
    setFormattedDate(`${month}. ${dayNum}${suffix} ${year}`);
  }, []);

  const themeClasses = useMemo(() => {
    switch (activeLayoutTheme) {
      case "theme-midnight":
        return {
          bg: "bg-[#04100b] text-zinc-100",
          card: "bg-[#09150f]/80 border-emerald-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_0_20px_rgba(16,185,129,0.03)] backdrop-blur-xl",
          border: "border-emerald-500/20",
          accent: "text-emerald-400 bg-emerald-950/30 border-emerald-500/30",
          glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)] bg-emerald-400"
        };
      case "theme-cyber":
        return {
          bg: "bg-[#0A0700] text-amber-100 font-mono",
          card: "bg-[#140D00]/80 border-amber-500/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_0_20px_rgba(245,158,11,0.03)] backdrop-blur-xl border-dashed",
          border: "border-amber-500/30",
          accent: "text-amber-500 bg-amber-950/40 border-amber-500/30 font-black",
          glow: "shadow-[0_0_20px_rgba(245,158,11,0.25)] bg-amber-500"
        };
      default:
        return {
          bg: "app-emerald-canvas text-zinc-100",
          card: "bg-[#0B1511]/80 border-emerald-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.6),inset_0_0_25px_rgba(16,185,129,0.04)] backdrop-blur-2xl",
          border: "border-emerald-500/20",
          accent: "text-emerald-400 bg-emerald-950/30 border-emerald-500/20",
          glow: "shadow-[0_0_15px_rgba(52,211,153,0.3)] bg-emerald-400"
        };
    }
  }, [activeLayoutTheme]);  

  const [userName, setUserName] = useState("User");

  useEffect(() => {
    setResetMs(msUntilReset());
    const id = window.setInterval(() => setResetMs(msUntilReset()), 1000);
    return () => window.clearInterval(id);
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

  // 📊 REAL OPERATOR VELOCITY TELEMETRY — feeds the Velocity Consistency Index.
  const taskHistory = useMemo(() => {
    const raw = behaviorAnalytics.taskHistory;
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry.date === "string");
  }, [behaviorAnalytics.taskHistory]);

  const velocityHistory = useMemo(() => {
    const days: Array<{ key: string; label: string; value: number }> = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const completions = taskHistory.filter((entry) => entry.date === key).length;
      days.push({
        key,
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        value: completions,
      });
    }
    return days;
  }, [taskHistory]);

  const currentStreak = Number(state.streak?.count ?? 0);
  const maxStreak = Math.max(currentStreak, Number(operatorProfile?.maxStreak ?? currentStreak));
  const streakMomentum = Math.min(100, currentStreak * 10);
  const velocityConsistencyIndex =
    total === 0 ? 0 : Math.min(100, Math.round(progress * 0.7 + streakMomentum * 0.3));
  const velocityConsistencyLabel =
    velocityConsistencyIndex >= 70
      ? "Elite Momentum"
      : velocityConsistencyIndex >= 40
        ? "Stable Momentum"
        : "Recovery Posture";

  // Persist earned credits and streak progress. Without this, every reload
  // restored the stale profile row and silently discarded completed tasks.
  useEffect(() => {
    if (!hydrated || !profileHydrated || !currentUserId || !operatorProfile) return;

    const points = state.points ?? 0;
    const streak = state.streak?.count ?? 0;

    if (
      points === operatorProfile.credits &&
      streak === operatorProfile.currentStreak
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          credits: points,
          current_streak: streak,
          max_streak: Math.max(operatorProfile.maxStreak, streak),
          velocity_score: velocityConsistencyIndex,
        })
        .eq("id", currentUserId);

      if (error) {
        console.error("Progress telemetry sync failed:", error);
      }
    }, 750);

    return () => window.clearTimeout(timer);
  }, [
    state.points,
    state.streak?.count,
    velocityConsistencyIndex,
    hydrated,
    profileHydrated,
    currentUserId,
    operatorProfile,
  ]);

  // Persist the operator's real task-closure history + velocity score to the
  // profile row so the Velocity Consistency Index survives cross-session
  // reloads (sign-out -> sign-in) instead of resetting with the local cache.
  useEffect(() => {
    if (!hydrated || !profileHydrated || !currentUserId || !operatorProfile) return;
    if (!Array.isArray(behaviorAnalytics.taskHistory) || behaviorAnalytics.taskHistory.length === 0) return;

    const timer = window.setTimeout(async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          task_history: behaviorAnalytics.taskHistory ?? [],
          velocity_score: velocityConsistencyIndex,
        })
        .eq("id", currentUserId);

      if (error) {
        console.error("Task history telemetry sync failed:", error);
      }
    }, 750);

    return () => window.clearTimeout(timer);
  }, [
    behaviorAnalytics.taskHistory,
    velocityConsistencyIndex,
    hydrated,
    profileHydrated,
    currentUserId,
    operatorProfile,
  ]);

  function addTaskToMatrix(tier: ImpactTier, rawText: string): boolean {
    const text = rawText.trim();
    if (!text) return false;
    if (!premium && total >= FREE_TASK_LIMIT) {
      setPaywall(`The free plan tracks up to ${FREE_TASK_LIMIT} priority tasks. Upgrade to map out your full mission without limits.`);
      return false;
    }
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [tier]: [...(s.tasks[tier] || []), { id: nextId(), text, done: false }] },
    }));
    return true;
  }

  function addTask(tier: ImpactTier) {
    if (addTaskToMatrix(tier, drafts[tier])) {
      setDrafts((d) => ({ ...d, [tier]: "" }));
    }
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
      setScopedItem("apexmission-mission-plan-generated", "true");
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
      const taskId = (task: Task) => task.id ?? `${tier}-${task.text}`;
      const targetTask = currentTasks.find(t => taskId(t) === id);
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

        const taskCompletionHook = (window as any).__apex_task_completed;
        if (typeof taskCompletionHook === "function") {
          taskCompletionHook(targetTask?.text || "Task completed");
        }

        // Keep the operator-facing execution telemetry in sync so the Velocity
        // Consistency Index reflects real task closures as they happen.
        setBehaviorAnalytics((prev) => ({
          ...prev,
          totalTasksCompleted: (prev.totalTasksCompleted ?? 0) + 1,
          taskHistory: [
            ...(Array.isArray(prev.taskHistory) ? prev.taskHistory : []),
            { date: todayKey(), text: targetTask?.text || "Task completed" },
          ].slice(-30),
        }));
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
          [tier]: currentTasks.map((t) => (taskId(t) === id ? { ...t, done: !t.done } : t)),
        },
      };
    });
  }

  function removeTask(tier: ImpactTier, id: string) {
    setState((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [tier]: (s.tasks[tier] || []).filter(
          (t) => (t.id ?? `${tier}-${t.text}`) !== id,
        ),
      },
    }));
  }

  function commitDailyAction(text: string) {
    const trimmed = text.trim();
    setState((s) => ({ ...s, daily: { ...s.daily, text: trimmed, date: todayKey() } }));
    setDailyDraft(trimmed);
  }

  function commitDailyText() {
    commitDailyAction(dailyDraft);
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



    if (nextDone) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 500);
    }
  }

  async function handleSwitchTenantAccount() {
    await supabase.auth.signOut({ scope: "local" });
    setStorageScope(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
    }
    navigate({ to: "/auth", search: { mode: "signin", next: "/app" } });
  }

  function handleBriefingExecute(focus: "mission" | "daily" | "high" | "matrix") {
    setShowTacticalBriefing(false);
    setActiveTab("workspace");
    window.setTimeout(() => {
      const targetId =
        focus === "daily"
          ? "daily-action"
          : focus === "high" || focus === "matrix"
            ? "task-input-high"
            : "mission";
      const element = document.getElementById(targetId);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLElement) element.focus();
    }, 160);
  }

  function openMissionCoach() {
    setShowInduction(false);
    setShowTacticalBriefing(false);
    setCoachOpen(true);
  }

  // A company subdomain must never render the dashboard for a non-member.
  if (activeTenant && !activeTenant.isMember) {
    return (
      <div className="app-emerald-canvas min-h-screen text-zinc-100 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        <div className="ambient-emerald-glow" />
        <div className="grid-pattern-overlay" />
        <div className="relative w-full max-w-md rounded-2xl border border-amber-500/25 bg-[#0D0D11]/90 p-8 text-center backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6)]">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-950/30 text-amber-400">
            <Building2 className="size-6" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">
            Tenant Access Restricted
          </p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-white font-display">
            {activeTenant.companyName}
          </h1>
          <p className="mt-3 text-xs font-medium leading-relaxed text-zinc-400">
            This workspace is reserved for members of {activeTenant.companyName}. The current
            session is not linked to this organization.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSwitchTenantAccount}
              className="btn-glass-primary h-11"
            >
              Sign in with a company account
            </button>
            <a href={`${PLATFORM_APP_URL}/app`} className="btn-glass-ghost h-11">
              Go to www.{TENANT_ROOT_DOMAIN}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh md:h-dvh transition-all duration-500 ease-in-out ${themeClasses.bg} text-zinc-100 flex overflow-hidden animate-scan-line relative`}>
      
      {/* 🧭 DESKTOP / TABLET SIDEBAR NAVIGATION BAR */}
      <aside className="hidden md:flex w-56 lg:w-64 border-r border-emerald-500/20 bg-[#07130f]/90 backdrop-blur-xl flex-col justify-between overflow-y-auto p-3 lg:p-4 shrink-0 z-20">
        <div className="flex flex-col gap-6">
          {/* Brand Logo Header */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Target className="size-5 animate-pulse" />
            </div>
            <div className="text-left">
              <span className="font-black text-sm font-display tracking-[0.2em] text-white uppercase block">ApexMission</span>
              <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wider block mt-0.5">Command Terminal</span>
            </div>
          </div>

          {/* Navigation Links List */}
          <nav aria-label="Sidebar navigation" className="flex flex-col gap-1.5 font-mono text-xs font-black uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setActiveTab("workspace")}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "workspace"
                  ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] font-black"
                  : "text-zinc-400 hover:bg-emerald-950/20 hover:text-emerald-300 border border-transparent hover:border-emerald-500/10"
              }`}
            >
              <LayoutDashboard className="size-4" />
              <span>Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("leaderboard")}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "leaderboard"
                  ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] font-black"
                  : "text-zinc-400 hover:bg-emerald-950/20 hover:text-emerald-300 border border-transparent hover:border-emerald-500/10"
              }`}
            >
              <Award className="size-4" />
              <span>Ranks</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("hardware")}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                activeTab === "hardware"
                  ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] font-black"
                  : "text-zinc-400 hover:bg-emerald-950/20 hover:text-emerald-300 border border-transparent hover:border-emerald-500/10"
              }`}
            >
              <HardDrive className="size-4" />
              <span>Hardware</span>
            </button>
          </nav>
        </div>

        {/* Support & Coach Footer Actions */}
        <div className="flex flex-col gap-2 border-t border-emerald-500/10 pt-4">
          <button
            type="button"
            onClick={() => {
              setCoachOpen(false);
              setShowTacticalBriefing(true);
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-xs font-bold text-emerald-300 transition-all hover:border-emerald-500/50 hover:bg-emerald-500 hover:text-black font-mono uppercase tracking-wider shadow-[inset_0_1px_1px_rgba(52,211,153,0.1)]"
          >
            <Sparkles className="size-4 text-emerald-400" />
            <span>Tactical Briefing</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTacticalBriefing(false);
              setCoachOpen(true);
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3 text-xs font-bold text-zinc-300 transition-all hover:border-emerald-500/40 hover:bg-emerald-950/30 hover:text-emerald-400 font-mono uppercase tracking-wider shadow-[inset_0_1px_1px_rgba(52,211,153,0.1)]"
          >
            <MessageSquare className="size-4 text-emerald-400" />
            <span>Mission Coach</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3 text-xs font-bold text-zinc-300 transition-all hover:border-emerald-500/40 hover:bg-emerald-950/30 hover:text-emerald-400 font-mono uppercase tracking-wider shadow-[inset_0_1px_1px_rgba(52,211,153,0.1)]"
          >
            <HelpCircle className="size-4 text-emerald-400" />
            <span>Support</span>
          </button>
        </div>
      </aside>

      {/* 📱 MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Primary navigation"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-[#07130f]/95 border-t border-emerald-500/30 backdrop-blur-xl px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-stretch justify-around gap-1 font-mono text-[10px] font-black uppercase tracking-wider shadow-[0_-10px_30px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={() => setActiveTab("workspace")}
          aria-current={activeTab === "workspace" ? "page" : undefined}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-all ${
            activeTab === "workspace" ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30 font-black shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          <span className="w-full truncate text-center">Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("leaderboard")}
          aria-current={activeTab === "leaderboard" ? "page" : undefined}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-all ${
            activeTab === "leaderboard" ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30 font-black shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
        >
          <Award className="size-4 shrink-0" />
          <span className="w-full truncate text-center">Ranks</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("hardware")}
          aria-current={activeTab === "hardware" ? "page" : undefined}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-all ${
            activeTab === "hardware" ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30 font-black shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
        >
          <HardDrive className="size-4 shrink-0" />
          <span className="w-full truncate text-center">Store</span>
        </button>
        <button
          type="button"
          onClick={() => setCoachOpen(true)}
          className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-1 py-2 text-emerald-400 bg-emerald-950/30 hover:bg-emerald-950/50 transition-all"
        >
          <MessageSquare className="size-4 shrink-0" />
          <span className="w-full truncate text-center">Coach</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSupport(true)}
          className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-1 py-2 text-zinc-500 hover:text-zinc-300 transition-all"
        >
          <HelpCircle className="size-4 shrink-0 text-emerald-400" />
          <span className="w-full truncate text-center">Support</span>
        </button>
      </nav>

      {/* 🚀 MAIN CONTENT AREA */}
      <main ref={mainRef} className="flex-1 overflow-y-auto relative z-10 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 md:pb-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">

          {/* ⚡ FLOATING EMERALD NOTIFICATION BANNER */}
          {showPlanSuccessAlert && (
            <div
              role="status"
              className="fixed left-4 right-4 top-[calc(1rem+env(safe-area-inset-top))] z-50 flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-[#0E1612]/95 px-4 py-3.5 shadow-[0_0_35px_rgba(16,185,129,0.25)] backdrop-blur-xl animate-fade-in sm:left-auto sm:right-6 sm:top-6 sm:max-w-sm sm:items-center sm:px-5 sm:py-4"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-black shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                <Check className="size-4 stroke-[3]" />
              </div>
              <div className="min-w-0 text-left">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">Blueprint Initialized</h4>
                <p className="mt-0.5 text-[11px] font-medium text-zinc-400">Mission parameter metrics, tasks, and daily actions extracted perfectly.</p>
              </div>
            </div>
          )}

          {/* 🖥️ TOP DASHBOARD HEADER WITH GLASS EFFECT */}
          <header className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_0_20px_rgba(16,185,129,0.03)] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            
            {/* Operator Node Badge + AI briefing shortcut */}
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <span className="block truncate text-xs font-black uppercase text-white">Operator: {userName}</span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                  📅 {formattedDate}
                </span>
                {activeTenant?.isMember && (
                  <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 font-mono">
                    🏢 {activeTenant.companyName}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCoachOpen(false);
                  setShowTacticalBriefing(true);
                }}
                aria-label="Open tactical briefing"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-black md:hidden"
              >
                <Sparkles className="size-4" />
                <span>SITREP</span>
              </button>
            </div>

            {/* Right System Controls & Metrics */}
            <div className="grid w-full grid-cols-2 gap-2 font-mono lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end">
              <div className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-black/60 px-3 py-2 text-[10px] font-black text-emerald-400 shadow-[inset_0_1px_3px_rgba(52,211,153,0.15)]">
                <Shield className="size-3.5 fill-emerald-400/20 text-emerald-400" />
                <span className="truncate">{state?.points || 0} Credits</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAnalyticsModal(true)}
                className="flex min-h-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-emerald-400 transition-all duration-300 hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-black shadow-[0_0_15px_rgba(16,185,129,0.15)]"
              >
                📈 Metrics
              </button>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut({ scope: "local" });
                  setStorageScope(null);
                  sessionStorage.removeItem(TACTICAL_BRIEFING_SESSION_KEY);
                  navigate({ to: "/auth" });
                }}
                title="Disconnect Node"
                className="flex min-h-11 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-rose-400 transition-all duration-300 hover:border-rose-500/60 hover:bg-rose-500 hover:text-black"
              >
                🔌 Disconnect
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm("⚠️ SYSTEM FLASH RESET: Wipe this account's local operational data?")) {
                    clearCurrentUserStorage();
                    window.location.reload();
                  }
                }}
                title="Flush Cache Matrix"
                className="flex min-h-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-amber-400 transition-all duration-300 hover:border-amber-500/60 hover:bg-amber-500 hover:text-black"
              >
                🧹 Flush Cache
              </button>
            </div>
          </header>

          {/* WORKSPACE TAB */}
          {activeTab === "workspace" && (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* Vision Card with Emerald Glassmorphism */}
              <section className="relative overflow-hidden rounded-2xl border border-emerald-500/25 p-5 sm:p-8 bg-[#0D0D11]/80 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6),inset_0_0_25px_rgba(16,185,129,0.04)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                <label htmlFor="mission" className="block text-[10px] font-black uppercase tracking-widest text-emerald-400/80">
                  Core Vision Statement
                </label>
                <input
                  id="mission"
                  value={state.mission}
                  onChange={(e) => setState((s) => ({ ...s, mission: e.target.value }))}
                  placeholder="Define your core vision…"
                  className="field-flush mt-3 min-h-11 w-full truncate bg-transparent font-display text-xl font-black tracking-tight text-white outline-none placeholder:text-zinc-700 sm:text-4xl"
                />
                
                <div className="mt-5 flex flex-col gap-4 border-t border-emerald-500/15 pt-5 sm:mt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black border border-emerald-500/20">
                      <div
                        className="h-full rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-all duration-700 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap rounded border border-emerald-500/25 bg-emerald-950/40 px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-emerald-300 shadow-[inset_0_1px_2px_rgba(52,211,153,0.1)]">
                      {total === 0 ? "0%" : `${progress}% Done`}
                    </span>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                    <button
                      type="button"
                      onClick={generateActionPlan}
                      disabled={isGeneratingMissionPlan || !hydrated}
                      className="group flex h-11 w-full transform items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 text-xs font-bold tracking-wide text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all duration-300 ease-out hover:scale-[1.02] hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-black active:scale-[0.98] disabled:opacity-40 sm:h-10 sm:w-auto"
                    >
                      {isGeneratingMissionPlan ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-400" />
                      ) : (
                        <Sparkles className="size-3.5 shrink-0 text-emerald-400 transition-transform duration-300 group-hover:rotate-12" />
                      )}
                      {isGeneratingMissionPlan ? "Analyzing Mission..." : hasGeneratedMissionPlan ? "Regenerate AI Plan" : "Generate AI Plan"}
                    </button>
                    
                    {premium && (
                      <span className="self-center rounded-lg border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)] sm:self-auto">
                        {tier === "lifetime" ? "Lifetime" : "Premium"}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* Profile Selector with Emerald Glass */}
              <div className="flex flex-col gap-2 rounded-2xl border border-emerald-500/20 bg-[#0D0D11]/80 p-3.5 text-left backdrop-blur-xl shadow-[0_8px_25px_0_rgba(0,0,0,0.5)] sm:flex-row sm:items-center sm:gap-3">
                <span className="shrink-0 pl-1 text-[10px] font-black uppercase tracking-wider text-emerald-400/80 sm:whitespace-nowrap">Audience Track:</span>
                <select 
                  defaultValue="general"
                  onChange={(e) => {
                    const selectedTrack = e.target.value as keyof typeof AUDIENCE_PROFILES;
                    const profileDefaults = AUDIENCE_PROFILES[selectedTrack];
                    
                    if (window.confirm(`⚡ SYNCHRONIZE TRACK PROFILE: Clear current workspace grids and auto-load baseline execution rows for the ${e.target.options[e.target.selectedIndex]?.text ?? "selected"} matrix?`)) {
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
                  className="h-11 w-full cursor-pointer rounded-xl border border-emerald-500/20 bg-black/60 px-4 text-xs font-bold text-emerald-400 shadow-[inset_0_1px_3px_rgba(16,185,129,0.1)] outline-none focus:border-emerald-500/50 sm:flex-1"
                >
                  <option value="general">💼 Professional Standard Track</option>
                  <option value="ceo">🚀 Chief Executive Officer (CEO)</option>
                  <option value="corporate">🏢 Corporate Operational Track</option>
                  <option value="university">🎓 University/College Scholar Matrix</option>
                  <option value="student">🏫 High School Student Vector</option>
                </select>
              </div>

              {/* Task Columns */}
              <section className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {TIERS.map((tier) => (
                  <div key={tier.key} className="flex flex-col rounded-2xl p-4 bg-[#0D0D11]/80 border border-emerald-500/20 backdrop-blur-xl shadow-[0_8px_30px_0_rgba(0,0,0,0.5)] sm:p-5">
                    <div className="mb-3 flex flex-col gap-2 border-b border-emerald-500/15 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 shrink-0 rounded-full ${tier.accentClass}`} />
                        <h2 className={`truncate text-[10px] font-black uppercase tracking-widest ${tier.textClass}`}>
                          {tier.label}
                        </h2>
                        <span className="ml-auto shrink-0 rounded border border-emerald-500/20 bg-black px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-emerald-400 shadow-[inset_0_1px_2px_rgba(52,211,153,0.1)]">
                          {(state.tasks[tier.key] || []).filter((t) => t.done).length}/{(state.tasks[tier.key] || []).length}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px] uppercase text-zinc-500">
                        <span className="truncate">Cutoff Vector Window:</span>
                        <span className="shrink-0 font-bold tabular-nums tracking-wider text-emerald-400/90 animate-pulse">
                          {resetMs === null ? "00:00:00" : formatCountdown(resetMs)}
                        </span>
                      </div>
                    </div>

                    <ul className="flex max-h-[320px] flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
                      {(state.tasks[tier.key] || []).map((task) => {
                        const taskId = task.id ?? `${tier.key}-${task.text}`;
                        return (
                          <TaskRow
                            key={taskId}
                            task={task}
                            onToggle={() => toggleTask(tier.key, taskId)}
                            onRemove={() => removeTask(tier.key, taskId)}
                          />
                        );
                      })}
                      {(state.tasks[tier.key] || []).length === 0 && (
                        <li className="px-1 py-3 text-xs text-zinc-600 font-medium italic">No execution objects mapped.</li>
                      )}
                    </ul>

                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-black/50 px-4 shadow-[inset_0_1px_3px_rgba(16,185,129,0.1)] transition-colors focus-within:border-emerald-500/50">
                      <input
                        id={`task-input-${tier.key}`}
                        value={drafts[tier.key]}
                        onChange={(e) => setDrafts((d) => ({ ...d, [tier.key]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addTask(tier.key)}
                        placeholder={tier.placeholder}
                        className="field-flush h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder-zinc-700 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addTask(tier.key)}
                        disabled={!drafts[tier.key].trim()}
                        aria-label={`Add ${tier.label} task`}
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-950/40 text-emerald-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500 hover:text-black disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              {/* Daily Action */}
              <section className={`rounded-2xl border p-5 sm:p-8 transition-all duration-500 bg-[#0D0D11]/80 backdrop-blur-2xl border-emerald-500/25 shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] ${state.daily.done ? "border-emerald-500/50 bg-emerald-950/20" : ""}`}>
                <label htmlFor="daily-action" className="block text-[10px] font-black uppercase tracking-widest text-emerald-400/80">
                  Today's Master Focus Action
                </label>

                <div className="mb-5 mt-4 flex flex-col items-start gap-4 border-b border-emerald-500/15 pb-5 sm:mb-6 sm:flex-row sm:items-center sm:gap-5 sm:pb-6">
                  <button
                    type="button"
                    onClick={toggleDaily}
                    disabled={!hydrated || !state.daily.text.trim()}
                    className={`group flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-300 sm:size-14 ${
                      state.daily.done
                        ? "border-emerald-400 bg-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.5)]"
                        : "border-emerald-500/30 bg-black/60 hover:border-emerald-500/60 disabled:opacity-40"
                    } ${justCompleted ? "scale-110" : ""}`}
                  >
                    <Check
                      className={`size-6 transition-all duration-200 ${
                        state.daily.done ? "scale-100 text-black font-black" : "scale-50 text-transparent group-hover:text-emerald-500/50"
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
                    placeholder="Set today's top action…"
                    disabled={state.daily.done}
                    className={`field-flush min-h-11 min-w-0 w-full truncate bg-transparent font-display text-lg font-bold tracking-tight outline-none transition-all duration-300 placeholder:text-zinc-700 sm:text-2xl ${
                      state.daily.done ? "text-zinc-500 line-through decoration-emerald-500/50 decoration-2" : "text-white"
                    }`}
                  />
                </div>

                {isEvening && (
                  <div className="mx-auto mb-6 w-full max-w-md p-1">
                    <button
                      onClick={handleGoToNightReflection}
                      className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border p-4 bg-gradient-to-r from-[#060D08] to-black transition-all duration-400 border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                      <div className="relative z-10 flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/50 text-emerald-400 transition-colors duration-300 group-hover:border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                          <span className="text-sm">🌙</span>
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-400/70">Day Closeout</p>
                          <h4 className="truncate text-xs font-bold uppercase tracking-wide text-zinc-200 group-hover:text-white font-mono">Win Your Night</h4>
                        </div>
                      </div>
                      <div className="relative z-10 flex shrink-0 items-center gap-2 font-mono text-[10px] font-black uppercase tracking-wider text-zinc-500 transition-colors group-hover:text-emerald-400">
                        <span className="hidden sm:inline">Lock in Progress</span>
                        <span className="transform transition-transform duration-300 group-hover:translate-x-1">→</span>
                      </div>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-xl border bg-black ${state.streak.count > 0 ? "border-orange-500/40 bg-orange-950/20 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.2)]" : "border-emerald-500/20 text-zinc-600"}`}>
                      <Flame className={`size-5 ${state.streak.count > 0 ? "fill-orange-400" : ""}`} />
                    </div>
                    <div className="text-left">
                      <div className="font-mono text-lg font-black text-white tabular-nums">
                        {state.streak.count} Day{state.streak.count === 1 ? "" : "s"}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/70">
                        Active Execution Streak
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex w-full items-center justify-center gap-3 rounded-xl border border-emerald-500/20 bg-black/60 px-4 py-2 shadow-[inset_0_1px_3px_rgba(16,185,129,0.1)] sm:w-auto sm:justify-start">
                    <TimerReset className="size-4.5 shrink-0 text-emerald-400/70" />
                    <div className="text-left">
                      <div className="font-mono text-sm font-black tabular-nums text-emerald-400">
                        {resetMs === null ? "--:--:--" : formatCountdown(resetMs)}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">until calendar reset</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* RANKS LEADERBOARD TAB */}
          {activeTab === "leaderboard" && (
            <section className={`rounded-2xl border p-4 sm:p-6 text-left transform transition-all duration-500 translate-y-2 animate-fade-in ${themeClasses.card} bg-[#0D0D11]/80 border-emerald-500/25 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6)]`}>
              <div className="mb-4 flex flex-col justify-between gap-4 border-b border-emerald-500/15 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-white sm:text-sm">
                    <Trophy className="size-4 shrink-0 text-amber-400" /> Real-Time Network Operator Standings
                  </h2>
                  <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">Cross-examine absolute consistency vectors. Only real authenticated system operators currently mapped to this network cluster are displayed.</p>
                </div>
                
                <button
                  type="button"
                  disabled={loadingRoster}
                  onClick={fetchLiveAccountabilityRoster}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 font-mono text-[10px] font-black uppercase text-emerald-400 transition-all hover:bg-emerald-500 hover:text-black shadow-[0_0_15px_rgba(16,185,129,0.15)] sm:w-auto"
                >
                  {loadingRoster ? <Loader2 className="size-3 animate-spin text-emerald-400" /> : "🔄 Resync Ledger"}
                </button>
              </div>
              
              <div className="overflow-x-auto rounded-xl border border-emerald-500/20 bg-black/40 font-mono text-xs shadow-[inset_0_1px_4px_rgba(16,185,129,0.1)]">
                <div className="grid min-w-[600px] grid-cols-6 border-b border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-center text-[9px] font-black uppercase tracking-wider text-emerald-400/80 sm:text-left">
                  <span>Rank</span>
                  <span className="text-left">Operator Node</span>
                  <span className="text-center">Current</span>
                  <span className="text-center">Max Peak</span>
                  <span className="text-center">Failures / HUD</span>
                  <span className="text-right">Credit Balance</span>
                </div>

                <div className="min-w-[600px] divide-y divide-emerald-500/10">
                  {leaderboardOperators.map((operator, index) => {
                    const isCurrentClientNode = operator.id === currentUserId;
                    const activeDisplayCredits = isCurrentClientNode 
                      ? ((state as any).points !== undefined ? (state as any).points : 1000) 
                      : (operator.points || operator.beta_points || 0);

                    const hasFounderBadge = isCurrentClientNode 
                      ? getScopedItem("apexmission-unlocked-badge-alpha-founder") === "true"
                      : operator.unlocked_layouts?.includes("badge-alpha-founder");

                    return (
                      <div 
                        key={operator.id} 
                        className={`grid grid-cols-6 px-4 py-4 items-center text-center sm:text-left text-zinc-300 transition-colors duration-200 hover:bg-emerald-950/10 ${
                          isCurrentClientNode ? "bg-emerald-950/30 text-emerald-300 font-bold border-y border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : ""
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

                          {isCurrentClientNode && <span className="shrink-0 text-[8px] tracking-widest uppercase bg-emerald-950 border border-emerald-500/40 text-emerald-400 px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(16,185,129,0.3)]">YOU</span>}
                        </span>
                        
                        <span className="text-center text-orange-400 font-bold tabular-nums">{operator.current_streak}d</span>
                        <span className="text-center text-amber-500 font-bold tabular-nums">{operator.max_streak}d</span>
                        
                        <span className="text-center flex flex-col sm:flex-row items-center justify-center gap-1">
                          <span className="text-rose-400 font-semibold tabular-nums bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-500/20">{operator.failure_count}</span>
                          <span className={`text-[8px] font-black uppercase px-1 rounded tracking-wide border ${
                            operator.operational_status === "Operational" 
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]" 
                              : "bg-rose-950/40 text-rose-400 border-rose-500/30 animate-pulse"
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
            <section className="grid grid-cols-1 gap-4 text-left animate-fade-in sm:grid-cols-2 xl:grid-cols-3">
              {HARDWARE_STORE_INVENTORY.map((item) => (
                <div key={item.id} className={`flex flex-col justify-between rounded-2xl border p-4 bg-[#0D0D11]/80 border-emerald-500/25 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] sm:p-5`}>
                  <div>
                    <span className="rounded-lg bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-400 tracking-wider w-max block shadow-[0_0_10px_rgba(16,185,129,0.15)]">{item.type}</span>
                    <h4 className="text-sm font-black text-white mt-3">{item.name}</h4>
                    <p className="text-[11px] text-zinc-400 mt-1">{item.desc}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-emerald-400">{item.cost} credits</span>
                    <button 
                      type="button" 
                      onClick={async () => {
                        const currentPoints = (state as any).points || 0;
                        if (currentPoints < item.cost) return alert("❌ INSUFFICIENT OPERATIONAL CREDITS.");

                        const nextPoints = currentPoints - item.cost;
                        setState(s => ({ ...s, points: nextPoints }));

                        if (item.id.startsWith("theme-")) { 
                          setScopedItem("apexmission-active-theme", item.id); 
                        } else if (item.id.startsWith("badge-")) {
                          setScopedItem(`apexmission-unlocked-${item.id}`, "true");
                          alert(`💎 ALPHA COGNITIVE EMBLEM EQUIPPED: ${item.name} is now locked onto your identity matrix rows!`);
                        }

                        // Persist the debit so a reload does not restore the old balance.
                        if (currentUserId) {
                          const { error: creditError } = await supabase
                            .from("profiles")
                            .update({ credits: nextPoints })
                            .eq("id", currentUserId);
                          if (creditError) {
                            console.error("Credit debit persistence failed:", creditError);
                          }
                        }

                        if (item.id.startsWith("theme-") || item.id.startsWith("badge-")) {
                          window.location.reload();
                        }
                      }} 
                      className="flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-black font-mono shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all hover:bg-emerald-400 active:scale-95"
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
        <div
          role="status"
          className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 flex items-center gap-3 rounded-2xl border border-l-4 border-emerald-500/40 border-l-emerald-500 bg-[#0E1612]/95 p-4 text-left text-xs font-bold text-emerald-400 animate-fade-in shadow-[0_0_35px_rgba(16,185,129,0.3)] backdrop-blur-xl md:bottom-6 md:left-[15.5rem] md:right-auto md:max-w-sm lg:left-[17.5rem]"
        >
          <Sparkles className="size-4 shrink-0 animate-spin text-emerald-400" />
          <span className="min-w-0">{surpriseLoot.msg}</span>
        </div>
      )}

      <PaywallModal
        open={paywall !== null}
        reason={paywall ?? ""}
        onClose={() => setPaywall(null)}
        onUpgrade={handleUpgrade}
      />

      {showMilestoneCelebration !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 px-4 py-6 backdrop-blur-md animate-fade-in">
          <div className="relative my-auto max-h-[calc(100dvh-3rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-emerald-500/40 bg-[#0E1612]/95 p-6 text-center shadow-[0_0_50px_rgba(16,185,129,0.25)] backdrop-blur-2xl sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
            
            <div id="apex-progress-card" className="bg-[#0A0F0C] border border-emerald-500/30 rounded-xl p-6 mb-6 text-center shadow-[inset_0_1px_5px_rgba(16,185,129,0.15)]">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-950/50 text-emerald-400 mb-4 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
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
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.4)] active:scale-98 font-black font-mono uppercase tracking-wider"
              >
                📢 Share Progress Card
              </button>

              <button
                type="button"
                onClick={() => setShowMilestoneCelebration(null)}
                className="w-full rounded-xl border border-emerald-500/30 bg-black/60 py-3.5 text-sm font-bold text-emerald-300 transition-all duration-300 hover:border-emerald-500/60 hover:text-white active:scale-98 font-mono uppercase tracking-wider"
              >
                Continue Mission Execution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISSION COACH — user-initiated chat only. No onboarding/login auto-open. */}
      {hydrated && profileHydrated && (
        <MissionCoach
          showLauncher={false}
          premium={premium}
          state={{ ...state, failureCount: userFailureCount }}
          userName={userName}
          userRank={userRankText}
          isOpen={coachOpen}
          onOpenChange={(open) => {
            setCoachOpen(open);
            if (open) {
              setShowTacticalBriefing(false);
              setShowInduction(false);
            }
          }}
          onClose={() => setCoachOpen(false)}
          onLockedHistory={() => setPaywall("Your full coach history is a premium feature...")}
          companyId={operatorProfile?.companyId ?? null}
          leaderboard={leaderboardSnapshot}
          operatorProfile={operatorProfile}
          appContext={{
            activeTab,
            activeTheme: activeLayoutTheme,
            subscriptionTier: tier,
            companyName: activeTenant?.companyName ?? null,
          }}
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
      )}

      {/* FIRST SESSION — deterministic, non-chat, zero-API induction wizard */}
      <OperatorInduction
        open={showInduction && Boolean(operatorProfile && !operatorProfile.onboardingCompleted)}
        operatorName={operatorProfile?.operatorName ?? userName}
        mission={state.mission}
        dailyAction={state.daily.text}
        tasks={state.tasks}
        isCorporate={Boolean(operatorProfile?.companyId)}
        companyName={activeTenant?.companyName ?? null}
        onCommitMission={(mission) => setState((s) => ({ ...s, mission }))}
        onCommitDailyAction={commitDailyAction}
        onAddTask={addTaskToMatrix}
        onComplete={completeInduction}
        onSkip={completeInduction}
      />

      {/* RETURNING LOGIN — deterministic, non-chat, zero-API tactical dossier */}
      <TacticalBriefing
        open={showTacticalBriefing && Boolean(operatorProfile?.onboardingCompleted)}
        userName={userName}
        operatorProfile={operatorProfile}
        userRank={userRankText}
        state={{ ...state, failureCount: userFailureCount }}
        behaviorAnalytics={behaviorAnalytics}
        companyName={activeTenant?.companyName ?? null}
        leaderboard={leaderboardSnapshot}
        subscriptionTier={tier}
        activeTab={activeTab}
        activeTheme={activeLayoutTheme}
        onClose={() => setShowTacticalBriefing(false)}
        onOpenCoach={openMissionCoach}
        onExecute={handleBriefingExecute}
      />

      {/* SUPPORT MODAL */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 px-4 py-6 backdrop-blur-md">
          <div className="my-auto max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-emerald-500/30 bg-[#0D0D11]/95 p-5 text-left shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Support & Feedback
              </h3>
              <button
                type="button"
                onClick={() => setShowSupport(false)}
                aria-label="Close support"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              Found a bug, have a suggestion, or need help? Send an email for support.
            </p>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 mb-5">
              <p className="text-xs text-zinc-400">
                Replies are sent within <span className="text-emerald-400 font-semibold">1–4 business days</span>.
              </p>
            </div>

            <a
              href="mailto:support@apexmissions.app?subject=ApexMission Support / Feedback"
              className="flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-400 font-mono"
              onClick={() => setShowSupport(false)}
            >
              Email Support →
            </a>
            <p className="mt-2 break-all text-center font-mono text-[10px] text-zinc-500">
              support@apexmissions.app
            </p>
          </div>
        </div>
      )}

      {/* METRICS VISUALIZER MODAL */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 px-4 py-6 text-left font-mono backdrop-blur-md animate-fade-in">
          <div className="relative my-auto max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-emerald-500/30 bg-[#0A0A0F]/95 p-4 shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-8">
            <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
            
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-emerald-500/20 pb-4 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-white sm:text-sm">📈 Velocity Consistency Index</h3>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-emerald-400/70">Real Operator Execution Telemetry</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAnalyticsModal(false)}
                aria-label="Close metrics"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-black text-xs font-bold text-emerald-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 sm:space-y-5">
              {/* VELOCITY CONSISTENCY SCORE — real task closure + streak telemetry */}
              <div className="rounded-xl border border-emerald-500/25 bg-black/60 p-4 text-center sm:p-5">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
                  Current Velocity Consistency
                </p>
                <p className="mt-2 font-mono text-5xl font-black tabular-nums text-emerald-400">
                  {velocityConsistencyIndex}
                  <span className="text-base font-bold text-zinc-500">/100</span>
                </p>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                  {velocityConsistencyLabel}
                </p>
                <p className="mt-2 text-[10px] font-medium text-zinc-500">
                  Blended from task closure discipline ({progress}% of the priority matrix closed) and mission momentum ({currentStreak}-day streak).
                </p>
              </div>

              <div className="relative flex h-40 w-full items-end justify-between gap-2 rounded-xl border border-emerald-500/20 bg-black/60 p-3 shadow-[inset_0_1px_4px_rgba(16,185,129,0.1)] sm:h-44 sm:gap-2.5 sm:p-4">
                <div className="absolute left-0 right-0 top-1/4 h-px border-t border-emerald-500/10 border-dashed" />
                <div className="absolute left-0 right-0 top-2/4 h-px border-t border-emerald-500/10 border-dashed" />
                <div className="absolute left-0 right-0 top-3/4 h-px border-t border-emerald-500/10 border-dashed" />

                {velocityHistory.map((bar) => {
                  const maxCompletions = Math.max(1, ...velocityHistory.map((day) => day.value));
                  const barHeight = Math.max(4, (bar.value / maxCompletions) * 100);
                  const isToday = bar.key === todayKey();
                  return (
                    <div key={bar.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end relative z-10">
                      <span className="text-[9px] font-mono font-black tabular-nums text-emerald-400/90">
                        {bar.value > 0 ? `${bar.value} Task${bar.value === 1 ? "" : "s"}` : "—"}
                      </span>
                      <div 
                        className={`w-full rounded-t-md transition-all duration-1000 border-t ${
                          bar.value > 0
                            ? isToday
                              ? "bg-gradient-to-t from-teal-600 to-teal-400 border-teal-300 shadow-[0_0_15px_rgba(45,212,191,0.2)] text-white"
                              : "bg-gradient-to-t from-emerald-600 to-emerald-400 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] text-white"
                            : "bg-emerald-950/40 border-emerald-500/20 text-emerald-400"
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                      <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mt-1">{bar.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-black/40 p-3.5 text-[11px] leading-relaxed text-zinc-300">
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Task Execution Vector:</span> <span className="font-bold text-emerald-400">{progress}% ({done}/{total} objectives closed)</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Current Streak:</span> <span className="font-bold tabular-nums text-emerald-400">{currentStreak}d</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Tasks Completed:</span> <span className="font-bold tabular-nums text-emerald-400">{behaviorAnalytics.totalTasksCompleted}</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Sessions Logged:</span> <span className="font-bold tabular-nums text-emerald-400">{behaviorAnalytics.sessionCount}</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Procrastination Events:</span> <span className={`font-bold tabular-nums ${(behaviorAnalytics.procrastinationEvents ?? 0) > 3 ? "text-rose-400" : "text-emerald-400"}`}>{behaviorAnalytics.procrastinationEvents ?? 0}</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Daily Action Status:</span> <span className={`font-bold tabular-nums ${state.daily?.done ? "text-emerald-400" : "text-amber-400"}`}>{state.daily?.done ? "Executed" : "Pending"}</span></p>
                <p className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[9px] font-bold uppercase text-zinc-500">Avg Completions / Day:</span> <span className="font-bold tabular-nums text-emerald-400">{computeAverageCompletionsPerDay(taskHistory)}</span></p>
                <p className="mt-2 border-t border-emerald-500/10 pt-2 text-[10px] italic text-zinc-400">
                  {total === 0
                    ? "⚠️ VELOCITY SCORING PENDING: Populate the priority matrix to activate the consistency index."
                    : progress < 40
                      ? `⚠️ LOW EXECUTION DENSITY: Only ${progress}% of the priority matrix has closed. Deploy a focused recovery block toward your next high-impact objective.`
                      : state.daily?.done
                        ? "✅ CONSISTENCY STABLE: Task closures and daily cadence are aligned. Maintain current execution velocity."
                        : "⚠️ DAILY ACTION PENDING: Close today's action to protect streak integrity and velocity consistency."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAnalyticsModal(false)}
              className="mt-5 h-11 w-full rounded-xl bg-emerald-500 font-mono text-xs font-black uppercase tracking-wider text-black transition-all duration-300 hover:bg-emerald-400 hover:shadow-[0_0_25px_rgba(52,211,153,0.35)] sm:mt-6"
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
    <li className="group flex items-start justify-between gap-2 rounded-xl border border-emerald-500/15 bg-black/40 px-2 py-1.5 transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-950/10">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={task.done ? `Mark "${task.text}" as not done` : `Mark "${task.text}" as done`}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-emerald-950/30"
        >
          <span
            className={`flex size-5 items-center justify-center rounded-md border-2 transition-colors duration-200 ${
              task.done
                ? "border-emerald-400 bg-emerald-400 text-black font-bold shadow-[0_0_10px_rgba(52,211,153,0.4)]"
                : "border-emerald-500/30 text-transparent group-hover:border-emerald-400/60"
            }`}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        </button>
        <span
          title={task.text}
          className={`line-clamp-2 min-h-10 min-w-0 break-words py-2 text-sm font-semibold leading-snug ${task.done ? "text-zinc-500 line-through decoration-emerald-500/40" : "text-zinc-200"}`}
        >
          {task.text}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${task.text}"`}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 opacity-80 transition-all duration-200 hover:bg-zinc-900 hover:text-rose-400 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
  { key: "high", label: "High Impact", accentClass: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]", borderClass: "focus-within:border-rose-500/30", textClass: "text-rose-400 font-bold", placeholder: "Add high-impact…" },
  { key: "medium", label: "Medium Impact", accentClass: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]", borderClass: "focus-within:border-amber-500/30", textClass: "text-amber-400 font-bold", placeholder: "Add secondary…" },
  { key: "low", label: "Low Impact", accentClass: "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]", borderClass: "focus-within:border-sky-500/30", textClass: "text-sky-400 font-bold", placeholder: "Add maintenance…" }
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

function toDisplayName(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "Operator";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}