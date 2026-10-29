import { useChat } from "@ai-sdk/react";
import { extractText } from "@/lib/document-parser";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Lock, MessageCircle, X, Paperclip, Sparkles, Loader2, Target, Flame, Trophy, Activity, Zap, Brain, Shield, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  analyzeOperatorDiscipline,
  computeAverageCompletionsPerDay,
  type LeaderboardSnapshot,
  type OperatorProfileMetadata,
} from "@/lib/synthetic-briefing";
import { loadState, saveState, todayKey } from "@/lib/mission-store";
import { getScopedItem, setScopedItem } from "@/lib/user-storage";
import { supabase } from "@/integrations/supabase/client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

const STORAGE_KEY = "mission-coach-chat-v1";
const LIMIT_KEY = "apexmission-coach-daily-tokens";
const FREE_HISTORY_LIMIT = 6;
const BEHAVIOR_ANALYTICS_KEY = "apexmission-behavior-analytics";

const QUICK_STARTS = [
  { label: "🎯 Mission Strategy", prompt: "Analyze my current mission strategy and provide tactical improvements based on my performance metrics." },
  { label: "⚡ Break Through Blockers", prompt: "I'm facing obstacles. Help me identify and overcome my current blockers with military precision." },
  {
    label: "📊 Performance Review",
    prompt: "Conduct a comprehensive performance review of my execution patterns, streak consistency, and behavioral metrics.",
  },
  {
    label: "🔥 Restore Momentum",
    prompt: "My momentum has degraded. Deploy recovery protocols to get me back to elite execution velocity immediately.",
  },
];

interface BehaviorAnalytics {
  sessionCount: number;
  lastSessionDate: string;
  totalTasksCompleted: number;
  averageCompletionTime: number;
  procrastinationEvents: number;
  peakProductivityHour: number;
  totalMessagesExchanged: number;
  streakConsistency: number;
  preferredFocusAreas: string[];
  taskHistory?: Array<{ date: string; text?: string }>;
}

/**
 * The coach chat is user-initiated only. Onboarding and login briefings are
 * deterministic screens, so this loader never seeds a synthetic tutorial into
 * the conversation. It only restores the operator's own saved history.
 */
function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = getScopedItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UIMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // A corrupt cache should not block the coach from opening.
  }

  return [];
}

function loadBehaviorAnalytics(): BehaviorAnalytics {
  try {
    const raw = getScopedItem(BEHAVIOR_ANALYTICS_KEY);
    return raw ? (JSON.parse(raw) as BehaviorAnalytics) : {
      sessionCount: 0,
      lastSessionDate: "",
      totalTasksCompleted: 0,
      averageCompletionTime: 0,
      procrastinationEvents: 0,
      peakProductivityHour: 12,
      totalMessagesExchanged: 0,
      streakConsistency: 0,
      preferredFocusAreas: [],
      taskHistory: []
    };
  } catch {
    return {
      sessionCount: 0,
      lastSessionDate: "",
      totalTasksCompleted: 0,
      averageCompletionTime: 0,
      procrastinationEvents: 0,
      peakProductivityHour: 12,
      totalMessagesExchanged: 0,
      streakConsistency: 0,
      preferredFocusAreas: [],
      taskHistory: []
    };
  }
}

function saveBehaviorAnalytics(analytics: BehaviorAnalytics) {
  try {
    setScopedItem(BEHAVIOR_ANALYTICS_KEY, JSON.stringify(analytics));
  } catch {}
}

let audioContext: AudioContext | null = null;
let audioUnlocked = false;

if (typeof window !== "undefined") {
  const unlockAudio = () => {
    audioUnlocked = true;
    if (audioContext && audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || !audioUnlocked) return null;
  
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;
    
    if (!audioContext) {
      audioContext = new AudioCtxClass();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {});
    }
    return audioContext;
  } catch {
    return null;
  }
}

function playSoundEffect(type: "success" | "warning" | "alert" | "message" | "open" | "close") {
  if (typeof window === "undefined") return;
  
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    switch (type) {
      case "success":
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.05, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.3);
        });
        break;
        
      case "warning":
        const warnOsc = ctx.createOscillator();
        const warnGain = ctx.createGain();
        warnOsc.type = "sawtooth";
        warnOsc.frequency.setValueAtTime(440, now);
        warnOsc.frequency.linearRampToValueAtTime(220, now + 0.3);
        warnGain.gain.setValueAtTime(0.08, now);
        warnGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        warnOsc.connect(warnGain);
        warnGain.connect(ctx.destination);
        warnOsc.start();
        warnOsc.stop(now + 0.3);
        break;
        
      case "alert":
        const alertOsc = ctx.createOscillator();
        const alertGain = ctx.createGain();
        alertOsc.type = "square";
        alertOsc.frequency.setValueAtTime(880, now);
        alertGain.gain.setValueAtTime(0.06, now);
        alertGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        alertOsc.connect(alertGain);
        alertGain.connect(ctx.destination);
        alertOsc.start();
        alertOsc.stop(now + 0.15);
        break;
        
      case "message":
        const msgOsc = ctx.createOscillator();
        const msgGain = ctx.createGain();
        msgOsc.type = "sine";
        msgOsc.frequency.setValueAtTime(880, now);
        msgGain.gain.setValueAtTime(0.03, now);
        msgGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        msgOsc.connect(msgGain);
        msgGain.connect(ctx.destination);
        msgOsc.start();
        msgOsc.stop(now + 0.1);
        break;
        
      case "open":
        [261.63, 329.63, 392.00].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          gain.gain.setValueAtTime(0.04, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.2);
        });
        break;
        
      case "close":
        const closeOsc = ctx.createOscillator();
        const closeGain = ctx.createGain();
        closeOsc.type = "sine";
        closeOsc.frequency.setValueAtTime(392.00, now);
        closeOsc.frequency.linearRampToValueAtTime(261.63, now + 0.2);
        closeGain.gain.setValueAtTime(0.04, now);
        closeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        closeOsc.connect(closeGain);
        closeGain.connect(ctx.destination);
        closeOsc.start();
        closeOsc.stop(now + 0.2);
        break;
    }
  } catch (e) {
    console.warn("Audio context unavailable:", e);
  }
}

export interface CoachAppContext {
  activeTab: string;
  activeTheme: string;
  subscriptionTier: string;
  companyName?: string | null;
}

export function MissionCoach({
  premium = false,
  state,
  userName = "User",
  userRank = "Global Operator Node",
  onLockedHistory,
  onActionPlanGenerated,
  isOpen,
  onClose,
  onOpenChange,
  companyId = null,
  leaderboard = null,
  operatorProfile = null,
  appContext = null,
  showLauncher = true,
}: {
  premium?: boolean;
  state: any;
  userName?: string;
  userRank?: string;
  onLockedHistory?: () => void;
  onActionPlanGenerated?: (plan: any) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  companyId?: string | null;
  leaderboard?: LeaderboardSnapshot | null;
  operatorProfile?: OperatorProfileMetadata | null;
  appContext?: CoachAppContext | null;
  showLauncher?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[]>([]);
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
    taskHistory: []
  });
  const [mounted, setMounted] = useState(false);

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) {
      onOpenChange(next);
      return;
    }
    if (isOpen !== undefined) {
      if (!next) onClose?.();
      return;
    }
    setInternalOpen(next);
  };

  useEffect(() => {
    setMounted(true);
    setInitial(loadMessages());
  }, []);

  useEffect(() => {
    if (!mounted || !open) return;
    setBehaviorAnalytics((prev) => {
      const next = {
        ...prev,
        sessionCount: prev.sessionCount + 1,
        lastSessionDate: new Date().toISOString(),
      };
      if (next.totalTasksCompleted > 0) {
        next.peakProductivityHour = new Date().getHours();
      }
      saveBehaviorAnalytics(next);
      return next;
    });
  }, [open, mounted]);

  if (!mounted) {
    return showLauncher ? <CoachLauncher open={open} onToggle={() => setOpen(true)} /> : null;
  }
    
  return (
    <CoachPanel
      key="coach"
      open={open}
      setOpen={setOpen}
      showLauncher={showLauncher}
      initialMessages={initial}
      premium={premium}
      onLockedHistory={onLockedHistory}
      state={state}
      userName={userName}
      userRank={userRank}
      onActionPlanGenerated={onActionPlanGenerated}
      behaviorAnalytics={behaviorAnalytics}
      setBehaviorAnalytics={setBehaviorAnalytics}
      companyId={companyId}
      leaderboard={leaderboard}
      operatorProfile={operatorProfile}
      appContext={appContext}
    />
  );
}

function CoachLauncher({ onToggle, open }: { onToggle: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`md:flex fixed right-5 bottom-5 z-40 hidden h-12 transform items-center gap-2.5 rounded-full border border-zinc-800 bg-[#0D0D11] px-5 text-xs font-bold tracking-wide text-zinc-200 shadow-2xl transition-all duration-300 ease-out hover:scale-105 hover:border-emerald-500/40 hover:text-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] active:scale-98 ${
        open ? "pointer-events-none opacity-0 scale-90" : "opacity-100 scale-100"
      }`}
    >
      <MessageCircle className="size-4.5 text-emerald-400 animate-pulse" />
      My Mission Coach
    </button>
  );
}

function CoachPanel({
  open,
  setOpen,
  showLauncher,
  initialMessages,
  premium,
  onLockedHistory,
  state,
  userName,
  userRank,
  onActionPlanGenerated,
  behaviorAnalytics,
  setBehaviorAnalytics,
  companyId,
  leaderboard,
  operatorProfile,
  appContext,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  showLauncher: boolean;
  initialMessages: UIMessage[];
  premium: boolean;
  onLockedHistory?: (() => void) | undefined;
  state: any;
  userName: string;
  userRank: string;
  onActionPlanGenerated?: ((plan: any) => void) | undefined;
  behaviorAnalytics: BehaviorAnalytics;
  setBehaviorAnalytics: Dispatch<SetStateAction<BehaviorAnalytics>>;
  companyId: string | null;
  leaderboard: LeaderboardSnapshot | null;
  operatorProfile: OperatorProfileMetadata | null;
  appContext: CoachAppContext | null;
}) {
  // Session token is resolved per request so refreshed tokens stay valid.
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: async () => {
      const { supabase: client } = await import("@/integrations/supabase/client");
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  }), []);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedText, setUploadedText] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [insightLevel, setInsightLevel] = useState<"basic" | "intermediate" | "advanced">("basic");

  useEffect(() => {
    if (behaviorAnalytics.sessionCount >= 10) setInsightLevel("advanced");
    else if (behaviorAnalytics.sessionCount >= 5) setInsightLevel("intermediate");
  }, [behaviorAnalytics.sessionCount]);

  const isRateLimited = false; 

  const { messages, sendMessage, status } = useChat({
    id: "mission-coach",
    messages: initialMessages,
    transport,
    onError: (e) => setError(e.message || "The coach could not respond. Try again."),
  });

  const userNameRef = useRef(userName);
  const userRankRef = useRef(userRank);

  useEffect(() => {
    userNameRef.current = userName;
    userRankRef.current = userRank;
  }, [userName, userRank]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const currentName = userNameRef.current || userName || "User";
    const currentRank = userRankRef.current || userRank || "Global Operator Node";

    const textLower = trimmed.toLowerCase();
    const slackingSignals = [
      "i procrastinated",
      "i gave up",
      "i was lazy",
      "i didn't do",
      "i did not do",
      "i skipped",
      "i wasted",
    ];
    const indicatesSlacking = slackingSignals.some((signal) =>
      textLower.includes(signal),
    );
    const fallbackPoints = state?.points || 1000;
  
    if (indicatesSlacking) {
      const aiPenalty = 100;

      // The mission store is the single source of truth (the previous code
      // read/wrote a non-existent "apexmission-state" key, so penalties were
      // silently discarded).
      const persistedState = loadState();
      const currentPoints =
        typeof persistedState.points === "number" ? persistedState.points : fallbackPoints;
      const freshPoints = Math.max(0, currentPoints - aiPenalty);

      saveState({ ...persistedState, points: freshPoints });

      // Keep the dashboard's in-memory balance in sync with the persisted one.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("apexmission:points-updated", {
            detail: { points: freshPoints },
          }),
        );
      }

      // Mirror the debit to the server so reloading does not restore the old
      // balance from the authoritative profile row.
      void supabase.auth
        .getUser()
        .then(({ data: { user } }) => {
          if (!user) return;
          return supabase.from("profiles").update({ credits: freshPoints }).eq("id", user.id);
        })
        .catch((error) => {
          console.error("Coach credit penalty sync failed:", error);
        });

      playSoundEffect("warning");
      
      setBehaviorAnalytics(prev => ({
        ...prev,
        procrastinationEvents: prev.procrastinationEvents + 1
      }));
    }

    const nextCount = usageCount + 1;
    setUsageCount(nextCount);
    
    setBehaviorAnalytics(prev => ({
      ...prev,
      totalMessagesExchanged: prev.totalMessagesExchanged + 1
    }));
    
    try {
      setScopedItem(LIMIT_KEY, JSON.stringify({
        date: new Date().toDateString(),
        count: nextCount
      }));
    } catch {}

    const highImpactTasks = (state?.tasks?.high || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No high impact vectors initialized.";

    const mediumImpactTasks = (state?.tasks?.medium || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No medium impact vectors initialized.";

    const lowImpactTasks = (state?.tasks?.low || [])
      .map((t: any) => `[${t.done ? "✓" : " "}] ${t.text}`)
      .join("\n      ") || "No low impact maintenance items mapped.";

    const taskCompletionRate = (() => {
      const allTasks = [...(state?.tasks?.high || []), ...(state?.tasks?.medium || []), ...(state?.tasks?.low || [])];
      if (allTasks.length === 0) return 0;
      const completed = allTasks.filter((t: any) => t.done).length;
      return Math.round((completed / allTasks.length) * 100);
    })();

    const currentHour = new Date().getHours();
    const productivityPhase =
      currentHour < 12
        ? "Morning Peak"
        : currentHour < 17
          ? "Afternoon Execution"
          : "Evening Review";

    const allTasks = [
      ...(state?.tasks?.high || []),
      ...(state?.tasks?.medium || []),
      ...(state?.tasks?.low || []),
    ];
    const completedTasks = allTasks.filter((task: any) => task?.done).length;
    const pendingHighImpact = (state?.tasks?.high || []).filter(
      (task: any) => !task?.done,
    ).length;

    const streak = Number(state?.streak?.count ?? 0);
    const maxStreak = Math.max(streak, Number(operatorProfile?.maxStreak ?? 0));
    const credits = Number(operatorProfile?.credits ?? state?.points ?? 0);
    const failures = Number(operatorProfile?.failureCount ?? state?.failureCount ?? 0);
    const dailyDone = Boolean(state?.daily?.done);
    const dailyText = String(state?.daily?.text || "").trim();
    const missionText = String(state?.mission || "").trim();

    const streakHealth = (() => {
      if (streak === 0) return "INACTIVE — immediate attention required";
      if (streak < 3) return "EMERGING — fragile momentum";
      if (streak < 7) return "BUILDING — consistent velocity";
      if (streak < 14) return "STRONG — elite trajectory";
      return "LEGENDARY — apex mastery";
    })();

    const operationalStatus =
      operatorProfile?.operationalStatus ||
      (failures >= 5
        ? "FALLEN — critical intervention required"
        : failures >= 3
          ? "AT RISK — performance degraded"
          : "OPERATIONAL — elite execution mode");

    const disciplineAudit = analyzeOperatorDiscipline({
      state,
      behaviorAnalytics,
      profile: operatorProfile,
      currentHour,
    });

    const reflectionHistory = Array.isArray(state?.reflectionHistory)
      ? state.reflectionHistory
      : [];
    const latestReflection = reflectionHistory[0] ?? null;
    const latestWins =
      String(state?.reflection?.wins || latestReflection?.wins || "").trim() ||
      "No night closeout recorded.";
    const latestBlockers =
      String(state?.reflection?.blockers || latestReflection?.blockers || "").trim() ||
      "No blockers recorded.";
    const nextVelocity =
      String(
        state?.reflection?.tomorrowAction || latestReflection?.tomorrowAction || "",
      ).trim() || "No next action recorded.";

    const rankTelemetry = companyId
      ? "REDACTED — corporate tenant scope. Public ranking is not exposed."
      : leaderboard
        ? `${leaderboard.rank === null ? "UNRANKED" : `#${leaderboard.rank} of ${leaderboard.totalOperators}`}; leader ${leaderboard.leaderName} (${leaderboard.leaderCredits} credits, ${leaderboard.leaderStreak}-day streak); gap ${Math.max(0, leaderboard.leaderCredits - credits)} credits.`
        : `${currentRank} — snapshot unavailable; resync the ledger.`;

    const tenantLabel = companyId
      ? `${appContext?.companyName || "Corporate tenant"} (${companyId})`
      : "Personal workspace (no tenant)";

    const focusAreas =
      behaviorAnalytics.preferredFocusAreas.length > 0
        ? behaviorAnalytics.preferredFocusAreas.join(", ")
        : "Not recorded";

    const telemetryContext = `
      [APEXMISSION OPERATOR TELEMETRY — READ EVERY FIELD BEFORE RESPONDING]

      === IDENTITY & SCOPE ===
      OPERATOR: ${currentName}
      RANK: ${currentRank}
      TRACK: ${companyId ? "CORPORATE OPERATOR" : "PERSONAL OPERATOR"}
      TENANT: ${tenantLabel}
      ONBOARDING STATE: ${operatorProfile?.onboardingCompleted ? "COMPLETE" : "INDUCTION PENDING"}
      ACTIVE MODULE: ${appContext?.activeTab ?? "workspace"}
      ACTIVE THEME: ${appContext?.activeTheme ?? "layout-default"}
      SUBSCRIPTION TIER: ${appContext?.subscriptionTier ?? "unknown"}
      OPERATIONAL STATUS: ${operationalStatus}
      LAST LOGGED ACTION: ${operatorProfile?.lastActionLogged || "None recorded"}

      === MISSION EXECUTION ===
      MASTER VISION: "${missionText || "NOT DECLARED"}"
      MISSION DECLARED: ${missionText ? "YES" : "NO — critical gap"}
      DAILY ACTION: "${dailyText || "NO DAILY ACTION ASSIGNED"}"
      DAILY STATUS: ${dailyDone ? "EXECUTED" : "PENDING"}
      CURRENT STREAK: ${streak} days (${streakHealth})
      MAX STREAK: ${maxStreak} days
      CREDITS: ${credits}
      FAILURE COUNT: ${failures}

      === TASK MATRIX ===
      HIGH IMPACT (${(state?.tasks?.high || []).length} total, ${pendingHighImpact} pending):
      ${highImpactTasks}

      MEDIUM IMPACT (${(state?.tasks?.medium || []).length} total):
      ${mediumImpactTasks}

      LOW IMPACT (${(state?.tasks?.low || []).length} total):
      ${lowImpactTasks}

      EXECUTION RATE: ${taskCompletionRate}% (${completedTasks}/${allTasks.length} objectives closed)
      PENDING HIGH-IMPACT: ${pendingHighImpact}

      === VELOCITY TELEMETRY ===
      VELOCITY CONSISTENCY INDEX: ${operatorProfile?.velocityScore ?? "NO SCORE RECORDED"}
      AVERAGE COMPLETIONS PER DAY: ${computeAverageCompletionsPerDay(behaviorAnalytics.taskHistory)}
      PERSISTED TASK CLOSURES: ${behaviorAnalytics.taskHistory?.length ?? 0}

      === BEHAVIOR TELEMETRY ===
      SESSIONS LOGGED: ${behaviorAnalytics.sessionCount}
      TASKS COMPLETED (LOCAL): ${behaviorAnalytics.totalTasksCompleted}
      PROCRASTINATION EVENTS: ${behaviorAnalytics.procrastinationEvents}
      AVERAGE COMPLETION TIME: ${behaviorAnalytics.averageCompletionTime > 0 ? `${Math.round(behaviorAnalytics.averageCompletionTime)} min/task` : "Insufficient data"}
      PEAK PRODUCTIVITY HOUR: ${behaviorAnalytics.peakProductivityHour}:00
      STREAK CONSISTENCY: ${behaviorAnalytics.streakConsistency}%
      COACH INTERACTIONS: ${behaviorAnalytics.totalMessagesExchanged}
      PREFERRED FOCUS AREAS: ${focusAreas}
      CURRENT TIME PHASE: ${productivityPhase}

      === REFLECTION LOOP ===
      MORNING LOGS: ${String(state?.daily?.text || "").trim() ? "1+ declaration on file" : "No morning declaration"}
      NIGHT LOGS: ${reflectionHistory.filter((entry: any) => entry?.phase === "night").length}
      LATEST WINS: "${latestWins}"
      LATEST BLOCKERS: "${latestBlockers}"
      NEXT VELOCITY BLOCK: "${nextVelocity}"

      === RANK LEDGER ===
      ${rankTelemetry}

      === DISCIPLINE AUDIT (LOCAL, DETERMINISTIC) ===
      THREAT LEVEL: ${disciplineAudit.severity}
      ACTIVE BAD HABITS:
      ${disciplineAudit.habits.length > 0 ? disciplineAudit.habits.map((habit) => `- ${habit}`).join("\n      ") : "- None detected in local telemetry."}
      AUDIT ASSESSMENT: ${disciplineAudit.assessment}
      THIS MESSAGE TRIGGERED A PENALTY: ${indicatesSlacking ? "YES — operator admitted avoidance" : "NO"}

      === COMMAND STANDARD ===
      You are MISSION COACH: a military-style performance operator, not a friend and not a therapist.
      1. Open with a one-line SITREP using exact telemetry numbers. Do not invent data.
      2. Name the specific bad habit or avoidance pattern visible in the audit, or state that none is present.
      3. Issue one next action the operator can execute in the next 10 minutes, tied to the Master Vision and the highest-impact objective.
      4. If the request is off-mission or a distraction, say so in one line and return to the next objective.
      5. If the operator admits slacking, acknowledge the debit, state the corrective action, and move on. Do not shame for sport.
      6. Praise only measurable execution. Never flatter. Never pad.
      7. Keep the response under 180 words unless the operator explicitly asks for a lesson or document analysis.
      8. End with a single accountability question or order. No closing pleasantries.

      [END TELEMETRY TRANSMISSION]
    `;

    const activePayload = uploadedText.trim()
      ? `${trimmed}\n\n${telemetryContext}\n\n[PARSED DOCUMENT FILE CONTEXT]:\n\n${uploadedText}`
      : `${trimmed}\n\n${telemetryContext}`;

    void sendMessage({ text: activePayload });
    setInput("");
    playSoundEffect("message");
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__apex_task_completed = (taskText: string) => {
        const analytics = loadBehaviorAnalytics();
        analytics.totalTasksCompleted += 1;
        analytics.taskHistory = [
          ...(Array.isArray(analytics.taskHistory) ? analytics.taskHistory : []),
          { date: todayKey(), text: taskText },
        ].slice(-30);

        const currentHour = new Date().getHours();
        if (analytics.totalTasksCompleted === 1) {
          analytics.peakProductivityHour = currentHour;
        } else {
          const taskCounts: Record<number, number> = {};
          taskCounts[currentHour] = (taskCounts[currentHour] || 0) + 1;
          const maxHour = Object.entries(taskCounts).sort((a, b) => b[1] - a[1])[0];
          if (maxHour) {
            analytics.peakProductivityHour = parseInt(maxHour[0]);
          }
        }
        
        saveBehaviorAnalytics(analytics);
        setBehaviorAnalytics(analytics);
        
        if (analytics.totalTasksCompleted % 5 === 0) {
          playSoundEffect("success");
        }
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__apex_task_completed;
      }
    };
  }, [state]);

  useEffect(() => {
    try {
      setScopedItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, status]);

  const busy = status === "submitted" || status === "streaming";

  function handleRemoveFile(indexToRemove: number) {
    setFiles((prevFiles: File[]) => prevFiles.filter((_, idx) => idx !== indexToRemove));
    setUploadedText("");
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;
    setFiles(selected);
    setPlanGenerated(false);
    const contents = await Promise.all(selected.map(extractText));
    const combined = contents.join("\n\n");
    setUploadedText(combined);
  }

  async function generateActionPlan() {
    if (!uploadedText || generatingPlan) return;
    setGeneratingPlan(true);
    try {
      const response = await fetch("/api/mission-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Server requires a verified Supabase session on every planner call.
          ...(await (await import("@/lib/api-auth")).authHeaders()),
        },
        body: JSON.stringify({ mission: uploadedText }),
      });
      if (!response.ok) throw new Error(`Mission Planner processing failure: ${response.status}`);
      const plan = await response.json();
      
      onActionPlanGenerated?.({
        mission: plan.mission,
        high: plan.high || [],
        medium: plan.medium || [],
        low: plan.low || [],
        dailyAction: plan.dailyAction || ""
      });
      
      setPlanGenerated(true);
      setFiles([]);
      setUploadedText("");
    } catch (error) {
      console.error("Document action plan mapping failed:", error);
      alert("Could not extract parameters from the attached context file.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {showLauncher && <CoachLauncher open={open} onToggle={() => setOpen(true)} />}

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close mission coach overlay"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      <aside
        aria-label="My Mission Coach"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-[#0D0D11] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-zinc-900 px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 bg-black/20">
          <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-400">
            <MessageCircle className="size-4.5 animate-pulse" />
          </div>
          <div className="min-w-0 text-left flex-1">
            <h2 className="font-display text-sm font-black tracking-tight text-white uppercase">My Mission Coach</h2>
            <p className="truncate text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Socratic Strategy · Active</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
              <Brain className="size-3 text-emerald-400" />
              <span className="text-[9px] font-bold text-emerald-400 font-mono">{insightLevel.toUpperCase()}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close mission coach"
              className="flex size-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-500 transition-colors hover:border-zinc-800 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Behavioral Intelligence Dashboard */}
        <div className="border-b border-zinc-900 px-5 py-3 bg-black/10">
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame className="size-3 text-orange-400" />
                <span className="text-[10px] font-bold text-zinc-400">Streak</span>
              </div>
              <span className="text-xs font-black text-white font-mono">{state?.streak?.count || 0}</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Target className="size-3 text-emerald-400" />
                <span className="text-[10px] font-bold text-zinc-400">Tasks</span>
              </div>
              <span className="text-xs font-black text-white font-mono">
                {(() => {
                  const allTasks = [...(state?.tasks?.high || []), ...(state?.tasks?.medium || []), ...(state?.tasks?.low || [])];
                  const completed = allTasks.filter((t: any) => t.done).length;
                  return `${completed}/${allTasks.length}`;
                })()}
              </span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Trophy className="size-3 text-amber-400" />
                <span className="text-[10px] font-bold text-zinc-400">Rank</span>
              </div>
              <span className="text-[10px] font-black text-white font-mono truncate px-1">{userRank.split(' ')[0] || "N/A"}</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Activity className="size-3 text-sky-400" />
                <span className="text-[10px] font-bold text-zinc-400">Sessions</span>
              </div>
              <span className="text-xs font-black text-white font-mono">{behaviorAnalytics.sessionCount}</span>
            </div>
          </div>
          
          {/* Behavioral Health Indicator */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-black rounded-full overflow-hidden border border-zinc-800">
              <div 
                className={`h-full transition-all duration-500 ${
                  behaviorAnalytics.procrastinationEvents > 5 
                    ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" 
                    : behaviorAnalytics.procrastinationEvents > 2 
                    ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                    : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                }`}
                style={{ width: `${Math.max(0, 100 - (behaviorAnalytics.procrastinationEvents * 10))}%` }}
              />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
              {behaviorAnalytics.procrastinationEvents > 5 ? (
                <span className="text-rose-400 flex items-center gap-1"><AlertTriangle className="size-3" />Critical</span>
              ) : behaviorAnalytics.procrastinationEvents > 2 ? (
                <span className="text-amber-400">Warning</span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1"><Shield className="size-3" />Optimal</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-900 px-5 py-3.5 bg-black/10">
          {QUICK_STARTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={busy || isRateLimited}
              onClick={() => send(chip.prompt)}
              className="min-h-11 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white active:scale-95 disabled:opacity-30"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <Conversation className="flex-1 bg-black/5">
          <ConversationContent className="gap-4 p-5">
            {messages.length === 0 && (
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-5 text-left text-xs font-medium text-zinc-500 leading-relaxed max-w-sm mx-auto mt-4">
                👋 Initializing mission briefing... Your coach is analyzing your dashboard matrices.
              </div>
            )}
            
            {!premium && messages.length > FREE_HISTORY_LIMIT && (
              <button
                type="button"
                onClick={onLockedHistory}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3.5 text-xs font-bold text-emerald-400 transition-all duration-300 hover:border-emerald-500/40"
              >
                <Lock className="size-3.5" />
                Unlock Complete Strategy Logs
              </button>
            )}

            {messages.map((message, index) => {
              let text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
              if (!text) return null;

              if (message.role === "user") {
                const telemetryIdx = text.indexOf("\n\n[");
                if (telemetryIdx !== -1) {
                  text = text.substring(0, telemetryIdx).trim();
                }
                if (text.includes("[SYSTEM_AUTO_TRIGGER")) {
                  text = "Initialize my operational briefing and review active metrics.";
                }
              }

              const locked = !premium && index < messages.length - FREE_HISTORY_LIMIT;
              return (
                <div key={message.id} className={locked ? "relative opacity-40 grayscale blur-[4px] pointer-events-none select-none" : "w-full text-left"}>
                  <Message from={message.role}>
                    <MessageContent className={message.role === "user" ? "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-2xl px-4 py-3 text-sm ml-auto max-w-[85%]" : "text-zinc-300 text-sm leading-relaxed p-2 max-w-full"}>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {locked && <span className="absolute inset-0" aria-hidden />}
                </div>
              );
            })}
            
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 p-2 text-left animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
              </div>
            )}
            {error && <p className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 text-xs font-bold text-rose-400 text-left">{error}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-zinc-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/20">
          <div className="flex flex-col gap-3 mb-4">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="coach-upload"
              disabled={isRateLimited}
            />
            
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="coach-upload"
                className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach Context
              </label>
            </div>

            {(files.length > 0 || planGenerated) && (
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-black/40 border border-zinc-900 animate-fade-in">
                <div className="flex flex-col gap-1 flex-1 text-left min-w-[150px]">
                  {files.length > 0 ? (
                    files.map((file, idx) => (
                      <div key={file.name} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 truncate">
                        📎 {file.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="ml-2 flex size-5 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-rose-400 font-black text-xs transition-colors duration-200"
                          title="Discard document context"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider pl-1">
                      ✓ Strategy Matrix Loaded
                    </div>
                  )}
                </div>

                {uploadedText && (
                  <button
                    type="button"
                    onClick={generateActionPlan}
                    disabled={generatingPlan}
                    className="transform inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[11px] font-bold text-black transition-all duration-300 hover:bg-emerald-400 active:scale-95 disabled:opacity-40"
                  >
                    {generatingPlan ? (
                      <Loader2 className="h-3 w-3 animate-spin text-black" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {generatingPlan ? "Extracting..." : planGenerated ? "Regenerate Mission Plan" : "Generate Mission Plan"}
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="relative flex flex-col w-full rounded-xl border border-zinc-800 bg-[#050507] p-4 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.08)] transition-all duration-300"
          >
            <textarea
              id="coach-brief"
              name="coach-brief"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRateLimited ? "Quota cap reached..." : "Brief your execution mentor... (Press Enter)"}
              disabled={isRateLimited || busy}
              className="field-flush w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-700 outline-none resize-none min-h-[48px] max-h-32 disabled:opacity-30 leading-relaxed"
            />
            <div className="flex justify-end pt-2 border-t border-zinc-900/50 mt-2">
              <button
                type="submit"
                disabled={!input.trim() || busy || isRateLimited}
                className="min-h-11 rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-black transition-all duration-200 hover:bg-emerald-400 hover:text-black disabled:opacity-20"
              >
                {busy ? "Sending..." : "Send Brief →"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}