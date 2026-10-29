import { useState, useEffect, useRef } from "react";
import { X, MessageCircle, Send, Sparkles, Target, Flame, Trophy, Activity, Zap, Brain, Shield, AlertTriangle, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import {
  generateSyntheticBriefing,
  type LeaderboardSnapshot,
} from "@/lib/synthetic-briefing";

interface SyntheticCoachOverlayProps {
  userName: string;
  operatorName?: string;
  userRank: string;
  state: any;
  behaviorAnalytics: any;
  isFirstSignup: boolean;
  companyId?: string | null;
  leaderboard?: LeaderboardSnapshot | null;
  onOnboardingComplete?: () => void | Promise<void>;
  onClose: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function SyntheticCoachOverlay({
  userName,
  operatorName,
  userRank,
  state,
  behaviorAnalytics,
  isFirstSignup,
  companyId = null,
  leaderboard = null,
  onOnboardingComplete,
  onClose,
  isOpen,
  onToggle,
}: SyntheticCoachOverlayProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [allOnboardingMessages, setAllOnboardingMessages] = useState<Message[]>([]);
  const [isOnboardingMode, setIsOnboardingMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onboardingFinalizedRef = useRef(false);

  const firstName = (operatorName || userName).split(" ")[0];

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Generate initial synthetic briefing
      const syntheticBriefing = generateSyntheticBriefing({
        userName,
        operatorName: operatorName || userName,
        userRank,
        state,
        behaviorAnalytics,
        isFirstSignup,
        currentHour: new Date().getHours(),
        companyId,
        leaderboard,
      });

      const initialMessages: Message[] = syntheticBriefing.map((item, idx) => ({
        id: `initial-${idx}-${Date.now()}`,
        role: item.role,
        content: item.content,
        timestamp: Date.now()
      }));

      // If first signup, use onboarding mode with step-by-step display
      const firstMessage = initialMessages[0];
      if (isFirstSignup && firstMessage) {
        setAllOnboardingMessages(initialMessages);
        setIsOnboardingMode(true);
        setOnboardingStep(0);
        setMessages([firstMessage]);
      } else {
        setMessages(initialMessages);
      }
    }
  }, [isOpen, messages.length, userName, operatorName, userRank, state, behaviorAnalytics, isFirstSignup, companyId, leaderboard]);

  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isMinimized]);

  const finalizeOnboarding = () => {
    if (onboardingFinalizedRef.current) return;
    onboardingFinalizedRef.current = true;
    setIsOnboardingMode(false);
    void Promise.resolve(onOnboardingComplete?.()).catch((error) => {
      console.error("Failed to persist onboarding completion state:", error);
    });
  };

  const handleClose = () => {
    // Closing the first-session briefing still consumes the one-time tutorial.
    // The database flag is written so it never appears again on future logins.
    if (isOnboardingMode) finalizeOnboarding();
    onToggle();
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const handleNextOnboardingStep = () => {
    if (onboardingStep < allOnboardingMessages.length - 1) {
      const nextStep = onboardingStep + 1;
      const nextMessage = allOnboardingMessages[nextStep];
      if (!nextMessage) return;
      setOnboardingStep(nextStep);
      setMessages(prev => [...prev, nextMessage]);
    } else {
      // Onboarding complete; permanently disable it in the profile database.
      finalizeOnboarding();
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Generate synthetic response based on keywords (zero API cost)
    setTimeout(() => {
      const response = generateSyntheticResponse(
        trimmed,
        operatorName || userName,
        userRank,
        state,
        behaviorAnalytics,
        companyId !== null,
      );
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 800 + Math.random() * 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-50 md:bottom-20 md:right-5">
        <button
          onClick={handleMinimize}
          className="flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-white shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all hover:scale-105 hover:bg-emerald-500 sm:gap-3 sm:px-6 sm:py-3"
        >
          <MessageCircle className="size-4 sm:size-5 animate-pulse" />
          <span className="font-bold text-xs sm:text-sm">Coach</span>
          <ChevronDown className="size-3 sm:size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed left-4 right-4 top-[calc(1rem+env(safe-area-inset-top))] z-50 mx-auto max-w-md sm:left-auto sm:right-4 sm:mx-0 sm:w-full">
      <div className="flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top))] flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#0D0D11] shadow-[0_0_60px_rgba(16,185,129,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-500/20 bg-[#0A0A0E]">
          <div className="flex items-center gap-3">
            <div className="relative">
              {isOnboardingMode ? (
                <BookOpen className="size-5 text-emerald-400 animate-pulse" />
              ) : (
                <MessageCircle className="size-5 text-emerald-400 animate-pulse" />
              )}
              <div className="absolute -top-1 -right-1 size-2.5 bg-emerald-500 rounded-full animate-ping" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-white">
                {isOnboardingMode ? "Onboarding Tutorial" : "Mission Coach"}
              </h2>
              <p className="text-[9px] text-emerald-400 font-mono">
                {isOnboardingMode ? `Step ${onboardingStep + 1}/${allOnboardingMessages.length}` : "Zero-API Synthetic"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Minimize AI briefing"
              onClick={handleMinimize}
              className="flex size-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Close AI briefing"
              onClick={handleClose}
              className="flex size-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-4 py-2.5 ${
                  message.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-100 border border-zinc-700"
                }`}
              >
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{message.content}</p>
                <p className="text-[9px] mt-1 opacity-60">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input / Next Button */}
        <div className="p-3 border-t border-emerald-500/20 bg-[#0A0A0E]">
          {isOnboardingMode ? (
            <button
              onClick={handleNextOnboardingStep}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white transition-all hover:bg-emerald-500"
            >
              {onboardingStep < allOnboardingMessages.length - 1 ? (
                <>
                  Next Step
                  <ChevronRight className="size-4" />
                </>
              ) : (
                <>
                  Complete Tutorial
                  <Sparkles className="size-4" />
                </>
              )}
            </button>
          ) : (
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your mission..."
                className="min-h-11 flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white transition-all hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500"
              >
                <Send className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function generateSyntheticResponse(
  userMessage: string,
  operatorName: string,
  userRank: string,
  state: any,
  behaviorAnalytics: any,
  isCorporate: boolean,
): string {
  const lowerMessage = userMessage.toLowerCase();
  const firstName = operatorName.split(" ")[0];

  // Task-related queries
  if (lowerMessage.includes("task") || lowerMessage.includes("to do") || lowerMessage.includes("work")) {
    const highTasks = state.tasks?.high || [];
    const mediumTasks = state.tasks?.medium || [];
    const lowTasks = state.tasks?.low || [];
    const completedHigh = highTasks.filter((t: any) => t.done).length;
    const completedMedium = mediumTasks.filter((t: any) => t.done).length;
    const completedLow = lowTasks.filter((t: any) => t.done).length;

    return `CURRENT TASK STATUS REPORT, ${firstName}:\n\n` +
      `⚡ HIGH-IMPACT: ${completedHigh}/${highTasks.length} completed\n` +
      `📊 MEDIUM-IMPACT: ${completedMedium}/${mediumTasks.length} completed\n` +
      `🔧 LOW-IMPACT: ${completedLow}/${lowTasks.length} completed\n\n` +
      `Total execution rate: ${Math.round(((completedHigh + completedMedium + completedLow) / (highTasks.length + mediumTasks.length + lowTasks.length || 1)) * 100)}%\n\n` +
      `Recommendation: Focus on completing high-impact objectives first to maximize your point multiplier.`;
  }

  // Mission-related queries
  if (lowerMessage.includes("mission") || lowerMessage.includes("vision") || lowerMessage.includes("goal")) {
    return `MISSION DIRECTIVE STATUS, ${firstName}:\n\n` +
      `Current Master Vision: ${state.mission || "NOT ESTABLISHED - CRITICAL PRIORITY"}\n\n` +
      `State: ${state.mission ? "ACTIVE" : "PENDING INITIALIZATION"}\n\n` +
      `Your mission is your operational foundation. Without it, execution lacks strategic direction. Establish your core vision statement to unlock full operational potential.`;
  }

  // Streak-related queries
  if (lowerMessage.includes("streak") || lowerMessage.includes("consistency") || lowerMessage.includes("day")) {
    const streak = state.streak?.count || 0;
    return `STREAK ANALYSIS, ${firstName}:\n\n` +
      `Current Streak: ${streak} days\n` +
      `Status: ${streak === 0 ? "INACTIVE - Start today" : streak >= 7 ? "ELITE - 7+ day multiplier active" : "BUILDING - Continue execution"}\n\n` +
      `Daily Action: ${state.daily?.done ? "✅ COMPLETED" : "⏳ PENDING"}\n\n` +
      (isCorporate
        ? "Maintain consistency to protect your task completion trend."
        : "Maintain consistency to unlock streak bonuses and advance your operational rank.");
  }

  // Leaderboard/rank queries
  if (lowerMessage.includes("rank") || lowerMessage.includes("leaderboard") || lowerMessage.includes("position")) {
    if (isCorporate) {
      return `CHANNEL SCOPE NOTICE, ${firstName}:\n\n` +
        `Public ranking telemetry is outside this operator channel. It is not available in your corporate track.\n\n` +
        `Authorized metrics: task completion trends, execution rate, streak consistency, and Priority Matrix status.\n\n` +
        `Ask about tasks, mission alignment, or performance patterns.`;
    }

    return `LEADERBOARD INTELLIGENCE, ${firstName}:\n\n` +
      `Current Position: ${userRank}\n` +
      `Operational Status: ${getOperationalStatus(state)}\n` +
      `Credits: ${(state as any).points || 0}\n\n` +
      `Advance your position by completing high-impact tasks and maintaining your streak consistency.`;
  }

  // Behavior/performance queries
  if (lowerMessage.includes("behavior") || lowerMessage.includes("performance") || lowerMessage.includes("how am i doing")) {
    return `BEHAVIORAL PERFORMANCE REPORT, ${firstName}:\n\n` +
      `Sessions Logged: ${behaviorAnalytics.sessionCount}\n` +
      `Tasks Completed: ${behaviorAnalytics.totalTasksCompleted}\n` +
      `Procrastination Events: ${behaviorAnalytics.procrastinationEvents}\n` +
      `Peak Productivity Hour: ${behaviorAnalytics.peakProductivityHour}:00\n` +
      `Insight Level: ${getInsightLevel(behaviorAnalytics.sessionCount)}\n\n` +
      `Analysis: ${behaviorAnalytics.procrastinationEvents > 3 ? "Elevated procrastination detected. Re-align focus immediately." : "Execution patterns are within optimal parameters."}`;
  }

  // Help/guidance queries
  if (lowerMessage.includes("help") || lowerMessage.includes("what should i do") || lowerMessage.includes("advice")) {
    return `TACTICAL GUIDANCE, ${firstName}:\n\n` +
      `Current Phase: ${getProductivityPhase(new Date().getHours())}\n\n` +
      `Immediate Actions:\n` +
      `1. ${!state.mission ? "ESTABLISH your Master Vision Statement" : "Review your mission alignment"}\n` +
      `2. ${!state.daily?.done ? "COMPLETE your daily focus action" : "Maintain execution momentum"}\n` +
      `3. ${state.tasks?.high?.filter((t: any) => !t.done).length > 0 ? "Execute pending high-impact tasks" : "Plan next strategic objectives"}\n\n` +
      `Type specific questions about your mission, tasks, or performance for detailed analysis.`;
  }

  // Default response
  const defaultTopics = [
    "Tasks and execution status",
    "Mission and vision alignment",
    "Streak and consistency metrics",
    ...(isCorporate ? [] : ["Leaderboard position and rank"]),
    "Behavioral performance patterns",
    "Tactical guidance and recommendations",
  ];

  return `Message received, ${firstName}. I can provide analysis on:\n\n` +
    defaultTopics.map((topic) => `• ${topic}`).join("\n") +
    `\n\nAsk about any of these areas for detailed intelligence.`;
}

function getOperationalStatus(state: any): string {
  const failures = (state as any).failureCount || 0;
  if (failures >= 5) return "🔴 FALLEN - Critical intervention required";
  if (failures >= 3) return "🟡 AT RISK - Performance degraded";
  return "🟢 OPERATIONAL - Elite execution mode";
}

function getInsightLevel(sessionCount: number): string {
  if (sessionCount >= 10) return "ADVANCED - Elite tactical awareness";
  if (sessionCount >= 5) return "INTERMEDIATE - Operational competence";
  return "BASIC - Initial training phase";
}

function getProductivityPhase(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning Peak Phase";
  if (hour >= 12 && hour < 17) return "Afternoon Execution Phase";
  if (hour >= 17 && hour < 21) return "Evening Review Phase";
  return "Night Recharge Phase";
}
