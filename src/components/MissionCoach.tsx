import { useChat } from "@ai-sdk/react";
import { extractText } from "@/lib/document-parser";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Lock, MessageCircle, X, Paperclip, Sparkles, Loader2, Target, Flame, Trophy, Activity, Zap, Brain, Shield, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
}

function loadMessages(): UIMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function loadBehaviorAnalytics(): BehaviorAnalytics {
  try {
    const raw = window.localStorage.getItem(BEHAVIOR_ANALYTICS_KEY);
    return raw ? (JSON.parse(raw) as BehaviorAnalytics) : {
      sessionCount: 0,
      lastSessionDate: "",
      totalTasksCompleted: 0,
      averageCompletionTime: 0,
      procrastinationEvents: 0,
      peakProductivityHour: 12,
      totalMessagesExchanged: 0,
      streakConsistency: 0,
      preferredFocusAreas: []
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
      preferredFocusAreas: []
    };
  }
}

function saveBehaviorAnalytics(analytics: BehaviorAnalytics) {
  try {
    window.localStorage.setItem(BEHAVIOR_ANALYTICS_KEY, JSON.stringify(analytics));
  } catch {}
}

let audioContext: AudioContext | null = null;
let audioInitialized = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;
    
    if (!audioContext) {
      audioContext = new AudioCtxClass();
    }
    
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {
        // Ignore resume errors - audio may not be available
      });
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

export function MissionCoach({
  premium = false,
  state,
  userName = "User",
  userRank = "Global Operator Node",
  onLockedHistory,
  onActionPlanGenerated,
  isOpen,
  onClose,
}: {
  premium?: boolean;
  state: any;
  userName?: string;
  userRank?: string;
  onLockedHistory?: () => void;
  onActionPlanGenerated?: (plan: any) => void;
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [behaviorAnalytics, setBehaviorAnalytics] = useState<BehaviorAnalytics>(loadBehaviorAnalytics());

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = onClose ? onClose : setInternalOpen;

  useEffect(() => {
    setInitial(loadMessages());
  }, []);

  useEffect(() => {
    if (open) {
      playSoundEffect("open");
      const analytics = loadBehaviorAnalytics();
      analytics.sessionCount += 1;
      analytics.lastSessionDate = new Date().toISOString();
      const currentHour = new Date().getHours();
      if (analytics.totalTasksCompleted > 0) {
        analytics.peakProductivityHour = currentHour;
      }
      
      if (analytics.sessionCount >= 10) {
        setInsightLevel("advanced");
      } else if (analytics.sessionCount >= 5) {
        setInsightLevel("intermediate");
      }
      
      saveBehaviorAnalytics(analytics);
      setBehaviorAnalytics(analytics);
    } else {
      playSoundEffect("close");
    }
  }, [open]);

  if (initial === null) {
    return <CoachLauncher open={open} onToggle={() => setOpen(true)} />;
  }
    
  return (
    <CoachPanel
      key="coach"
      open={open}
      setOpen={setOpen}
      initialMessages={initial}
      premium={premium}
      onLockedHistory={onLockedHistory}
      state={state}
      userName={userName}
      userRank={userRank}
      onActionPlanGenerated={onActionPlanGenerated}
      behaviorAnalytics={behaviorAnalytics}
      setBehaviorAnalytics={setBehaviorAnalytics}
    />
  );
}

function CoachLauncher({ onToggle, open }: { onToggle: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        onToggle();
        playSoundEffect("open");
      }}
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
  initialMessages,
  premium,
  onLockedHistory,
  state,
  userName,
  userRank,
  onActionPlanGenerated,
  behaviorAnalytics,
  setBehaviorAnalytics,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  initialMessages: UIMessage[];
  premium: boolean;
  onLockedHistory?: () => void;
  state: any;
  userName: string;
  userRank: string;
  onActionPlanGenerated?: (plan: any) => void;
  behaviorAnalytics: BehaviorAnalytics;
  setBehaviorAnalytics: (analytics: BehaviorAnalytics) => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedText, setUploadedText] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [insightLevel, setInsightLevel] = useState<"basic" | "intermediate" | "advanced">("basic");

  const isRateLimited = false; 

  const { messages, sendMessage, status } = useChat({
    id: "mission-coach",
    messages: initialMessages,
    transport,
    onError: (e) => setError(e.message || "The coach could not respond. Try again."),
  });

  const hasTriggeredThisSession = useRef(false);
  const userNameRef = useRef(userName);
  const userRankRef = useRef(userRank);

  useEffect(() => {
    userNameRef.current = userName;
    userRankRef.current = userRank;
  }, [userName, userRank]);

  function send(text: string, isSystemTrigger = false) {
    const trimmed = text.trim(); 
    if (!trimmed) return;

    const currentName = userNameRef.current || userName || "User";
    const currentRank = userRankRef.current || userRank || "Global Operator Node";
    
    let humanInputString = trimmed;
    let explicitOnboardingDirective = "";

    if (isSystemTrigger) {
      if (trimmed === "[SYSTEM_AUTO_TRIGGER_SIGNUP_ONBOARDING_GUIDE]") {
        humanInputString = "Initiate my operational onboarding command briefing. Break down how to get started on ApexMission.";
        explicitOnboardingDirective = `
          [CRITICAL COMMAND OVERRIDE: BRAND NEW SIGNUP OPERATOR ONBOARDING INITIALIZATION]
          The operator has JUST CREATED THEIR ACCOUNT. Address the operator by their exact name "${currentName}" immediately in your greeting.
          State their rank standing "${currentRank}" directly to them.
        `;
      } else {
        humanInputString = `Initialize my operational briefing for session start. Review my current metrics, streak, and dashboard components.`;
        
        const operationalStatus = (() => {
          const failureCount = state?.failureCount || 0;
          if (failureCount > 5) return "FALLEN - Critical Intervention Required";
          if (failureCount > 2) return "AT RISK - Performance Degraded";
          return "OPERATIONAL - Elite Execution Mode";
        })();
        
        explicitOnboardingDirective = `
          [CRITICAL SESSION BRIEFING OVERRIDE: LOGIN ACTIVE REPORT]
          The operator (${currentName}) has just logged into the session.
          
          === IMMEDIATE STATUS BRIEFING ===
          Leaderboard Standing: ${currentRank}
          Operational Status: ${operationalStatus}
          Failure Count: ${state?.failureCount || 0}
          Streak: ${state?.streak?.count || 0} Days
          Credits: ${state?.points || 1000} Credits
          
          MISSION DIRECTIVE: Greet the operator by name, acknowledge their operational status, call out their failures if any, and provide a comprehensive analysis of their current mission, daily action, and task matrix. Hold them accountable for their performance.
        `;
      }
    }

    const textLower = trimmed.toLowerCase();
    const indicatesSlacking = textLower.includes("procrastinate") || textLower.includes("gave up") || textLower.includes("lazy") || textLower.includes("didn't do");
    let cleanCurrentPoints = state?.points || 1000;
  
    if (indicatesSlacking) {
      const aiPenalty = 100; 
      const freshPoints = Math.max(0, cleanCurrentPoints - aiPenalty);
      
      try {
        const activeStateStr = localStorage.getItem("apexmission-state");
        if (activeStateStr) {
          const parsedState = JSON.parse(activeStateStr);
          if (parsedState && typeof parsedState.points === "number") {
            cleanCurrentPoints = parsedState.points; 
          }
        }
      } catch (e) {
        console.error("Local storage lookup bypassed safely:", e);
      }

      if (typeof window !== "undefined") {
        const currentStore = JSON.parse(localStorage.getItem("apexmission-state") || "{}");
        currentStore.points = freshPoints;
        localStorage.setItem("apexmission-state", JSON.stringify(currentStore));
      }

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
      localStorage.setItem(LIMIT_KEY, JSON.stringify({
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
    const productivityPhase = currentHour < 12 ? "Morning Peak" : currentHour < 17 ? "Afternoon Execution" : "Evening Review";

    const streakHealth = (() => {
      const streak = state?.streak?.count || 0;
      if (streak === 0) return "Inactive - Immediate Attention Required";
      if (streak < 3) return "Emerging - Fragile Momentum";
      if (streak < 7) return "Building - Consistent Velocity";
      if (streak < 14) return "Strong - Elite Trajectory";
      return "Legendary - Apex Mastery";
    })();

    const operationalStatus = (() => {
      const failureCount = state?.failureCount || 0;
      if (failureCount > 5) return "FALLEN - Critical Intervention Required";
      if (failureCount > 2) return "AT RISK - Performance Degraded";
      return "OPERATIONAL - Elite Execution Mode";
    })();

    const behaviorInsight = (() => {
      if (behaviorAnalytics.procrastinationEvents > 5) return "CRITICAL ALERT: Operator shows high procrastination patterns. Immediate intervention required.";
      if (behaviorAnalytics.sessionCount < 3) return "Operator in early integration phase. Focus on habit formation.";
      if (taskCompletionRate > 80) return "Excellent execution velocity. Recommend escalating mission complexity.";
      if (taskCompletionRate < 40) return "Execution metrics below optimal threshold. Investigate blockers.";
      return "Maintaining standard operational parameters.";
    })();

    const SocraticContext = `
      [ELITE MILITARY-GRADE OPERATOR TELEMETRY & BEHAVIORAL ANALYSIS SYSTEM]
      
      === OPERATOR IDENTITY MATRIX ===
      OPERATOR NAME: ${currentName}
      DESIGNATION: ${currentRank}
      OPERATIONAL STATUS: ${operationalStatus}
      STREAK HEALTH: ${streakHealth}
      TOTAL SESSIONS LOGGED: ${behaviorAnalytics.sessionCount}
      SESSION FREQUENCY: ${behaviorAnalytics.sessionCount > 10 ? "High Engagement" : "Building Consistency"}
      
      === PERFORMANCE METRICS ===
      CURRENT STREAK: ${state?.streak?.count || 0} Days (Health: ${streakHealth})
      CREDIT BALANCE: ${state?.points || 1000} Credits
      LEADERBOARD PLACEMENT: ${currentRank}
      FAILURE COUNT: ${state?.failureCount || 0}
      TASK COMPLETION RATE: ${taskCompletionRate}%
      TOTAL TASKS COMPLETED: ${behaviorAnalytics.totalTasksCompleted}
      AVERAGE COMPLETION TIME: ${behaviorAnalytics.averageCompletionTime > 0 ? `${Math.round(behaviorAnalytics.averageCompletionTime)} min/task` : "Insufficient Data"}
      PEAK PRODUCTIVITY HOUR: ${behaviorAnalytics.peakProductivityHour}:00
      CURRENT TIME PHASE: ${productivityPhase}
      
      === BEHAVIORAL TELEMETRY ===
      PROCRASTINATION EVENTS: ${behaviorAnalytics.procrastinationEvents}
      STREAK CONSISTENCY SCORE: ${behaviorAnalytics.streakConsistency}%
      TOTAL COACH INTERACTIONS: ${behaviorAnalytics.totalMessagesExchanged}
      FAILURE ANALYSIS: ${state?.failureCount > 0 ? `${state?.failureCount} failures detected - Pattern analysis required` : "Zero failures - Elite execution maintained"}
      AI BEHAVIORAL ASSESSMENT: ${behaviorInsight}
      
      === MISSION EXECUTION MATRIX ===
      MASTER VISION STATEMENT: "${state?.mission || "No overall mission statement declared."}"
      TODAY'S MASTER FOCUS ACTION: "${state?.daily?.text || "No single master action scheduled."}"
      DAILY ACTION STATUS: ${state?.daily?.done ? "✓ COMPLETED" : "⚠ PENDING / AT RISK"}
      
      === TASK VECTOR BREAKDOWN ===
      HIGH IMPACT LEVERAGE TASKS (${(state?.tasks?.high || []).length} total):
      ${highImpactTasks}
      
      MEDIUM IMPACT ALIGNMENT TASKS (${(state?.tasks?.medium || []).length} total):
      ${mediumImpactTasks}
      
      LOW IMPACT MAINTENANCE TASKS (${(state?.tasks?.low || []).length} total):
      ${lowImpactTasks}
      
      === REFLECTION & INTELLIGENCE LOGS ===
      MORNING CHECK-IN: Synchronized
      NIGHT REFLECTION DATA: "${state?.reflection?.wins || "No evening closeout logged yet."}"
      IDENTIFIED BLOCKERS: "${state?.reflection?.blockers || "None reported."}"
      TOMORROW'S TACTICAL DIRECTIVE: "${state?.reflection?.tomorrowAction || "Not defined."}"
      
      === SLACKING / DISCIPLINE ANALYSIS ===
      CURRENT DISCIPLINE METRIC: ${indicatesSlacking ? "⚠ DEGRADED - Penalty Audited" : "✓ OPTIMAL - Maintaining Elite Velocity"}
      RECENT BEHAVIORAL PATTERNS: ${behaviorAnalytics.procrastinationEvents > 2 ? "Warning: Recurring procrastination detected" : "Disciplined execution patterns observed"}
      
      === MILITARY COACH DIRECTIVE ===
      You are an elite, unyielding Socratic performance coach with military-grade precision. Your mission:
      
      1. ANALYZE: Deeply analyze all user metrics, task completion rates, goal proximity, work ethic, leaderboard standing, and behavioral patterns.
      2. HOLD ACCOUNTABLE: Strictly enforce discipline. Acknowledge wins but ruthlessly expose failures and procrastination.
      3. STRATEGIZE: Provide tactical, actionable recommendations based on behavioral data and time of day.
      4. MOTIVATE: Use military-inspired language that balances respect with uncompromising standards.
      5. PERSONALIZE: Reference the operator's name, rank, streak, and specific tasks in your responses.
      6. BE ELITE: Your responses should reflect the highest standards of coaching - concise, impactful, and brutally honest.
      
      ${explicitOnboardingDirective}
      
      [END TELEMETRY TRANSMISSION]
    `;

    const activePayload = uploadedText.trim()
      ? `${humanInputString}\n\n${SocraticContext}\n\n[PARSED DOCUMENT FILE CONTEXT]:\n\n${uploadedText}`
      : `${humanInputString}\n\n${SocraticContext}`;

    void sendMessage({ text: activePayload });
    setInput("");
    playSoundEffect("message");
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__apex_coach_trigger = (triggerText: string) => {
        send(triggerText, true);
        setOpen(true);
      };
      
      (window as any).__apex_task_completed = (taskText: string) => {
        const analytics = loadBehaviorAnalytics();
        analytics.totalTasksCompleted += 1;
        
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
        delete (window as any).__apex_coach_trigger;
        delete (window as any).__apex_task_completed;
      }
    };
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sessionKey = "apex-session-briefing-triggered";
    const sessionAlreadyTriggered = sessionStorage.getItem(sessionKey);
    const isUserLoaded = userName && userName !== "User" && state && state.points !== undefined;

    if (!sessionAlreadyTriggered && !hasTriggeredThisSession.current && isUserLoaded) {
      hasTriggeredThisSession.current = true;
      sessionStorage.setItem(sessionKey, "true");
      setOpen(true);

      const timer = setTimeout(() => {
        send("[SYSTEM_AUTO_TRIGGER_LOGIN_BRIEFING]", true);
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [userName, state, setOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
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
        headers: { "Content-Type": "application/json" },
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
      <CoachLauncher open={open} onToggle={() => setOpen(true)} />

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-800 bg-[#0D0D11] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-zinc-900 px-5 py-4 bg-black/20">
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
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-500 transition-colors hover:border-zinc-800 hover:text-white"
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
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white active:scale-95 disabled:opacity-30"
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

        <div className="border-t border-zinc-900 p-4 bg-black/20">
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
            className="relative flex flex-col w-full rounded-xl border border-zinc-800 bg-[#050507] p-3 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.08)] transition-all duration-300"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRateLimited ? "Quota cap reached..." : "Brief your execution mentor... (Press Enter)"}
              disabled={isRateLimited || busy}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-700 outline-none resize-none min-h-[48px] max-h-32 disabled:opacity-30 leading-relaxed"
            />
            <div className="flex justify-end pt-2 border-t border-zinc-900/50 mt-2">
              <button
                type="submit"
                disabled={!input.trim() || busy || isRateLimited}
                className="rounded-lg bg-white text-black px-4 py-1.5 text-xs font-bold transition-all duration-200 hover:bg-emerald-400 hover:text-black disabled:opacity-20"
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