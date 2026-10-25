import { useState, useEffect, useRef } from "react";
import { X, MessageCircle, Send, Sparkles, Target, Flame, Trophy, Activity, Zap, Brain, Shield, AlertTriangle, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { generateSyntheticBriefing } from "@/lib/synthetic-briefing";

interface SyntheticCoachOverlayProps {
  userName: string;
  userRank: string;
  state: any;
  behaviorAnalytics: any;
  isFirstSignup: boolean;
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
  userRank,
  state,
  behaviorAnalytics,
  isFirstSignup,
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

  const firstName = userName.split(" ")[0];

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Generate initial synthetic briefing
      const syntheticBriefing = generateSyntheticBriefing({
        userName,
        userRank,
        state,
        behaviorAnalytics,
        isFirstSignup,
        currentHour: new Date().getHours()
      });

      const initialMessages: Message[] = syntheticBriefing.map((item, idx) => ({
        id: `initial-${idx}-${Date.now()}`,
        role: item.role,
        content: item.content,
        timestamp: Date.now()
      }));

      // If first signup, use onboarding mode with step-by-step display
      if (isFirstSignup && initialMessages.length > 0) {
        setAllOnboardingMessages(initialMessages);
        setIsOnboardingMode(true);
        setOnboardingStep(0);
        setMessages([initialMessages[0]]);
      } else {
        setMessages(initialMessages);
      }
    }
  }, [isOpen, messages.length, userName, userRank, state, behaviorAnalytics, isFirstSignup]);

  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isMinimized]);

  const handleClose = () => {
    onToggle();
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const handleNextOnboardingStep = () => {
    if (onboardingStep < allOnboardingMessages.length - 1) {
      const nextStep = onboardingStep + 1;
      setOnboardingStep(nextStep);
      setMessages(prev => [...prev, allOnboardingMessages[nextStep]]);
    } else {
      // Onboarding complete, switch to normal mode
      setIsOnboardingMode(false);
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
      const response = generateSyntheticResponse(trimmed, userName, userRank, state, behaviorAnalytics);
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
      <div className="fixed bottom-24 right-4 sm:right-6 z-50">
        <button
          onClick={handleMinimize}
          className="flex items-center gap-2 sm:gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all hover:scale-105"
        >
          <MessageCircle className="size-4 sm:size-5 animate-pulse" />
          <span className="font-bold text-xs sm:text-sm">Coach</span>
          <ChevronDown className="size-3 sm:size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:right-4 z-50 w-full max-w-md mx-auto sm:mx-0">
      <div className="bg-[#0D0D11] rounded-2xl border border-emerald-500/30 shadow-[0_0_60px_rgba(16,185,129,0.2)] flex flex-col overflow-hidden max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)]">
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
              onClick={handleMinimize}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
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
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold transition-all"
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
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-bold transition-all flex items-center gap-1.5"
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
  userName: string,
  userRank: string,
  state: any,
  behaviorAnalytics: any
): string {
  const lowerMessage = userMessage.toLowerCase();
  const firstName = userName.split(" ")[0];

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
      `Maintain consistency to unlock streak bonuses and advance your operational rank.`;
  }

  // Leaderboard/rank queries
  if (lowerMessage.includes("rank") || lowerMessage.includes("leaderboard") || lowerMessage.includes("position")) {
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
  return `Message received, ${firstName}. I can provide analysis on:\n\n` +
    `• Tasks and execution status\n` +
    `• Mission and vision alignment\n` +
    `• Streak and consistency metrics\n` +
    `• Leaderboard position and rank\n` +
    `• Behavioral performance patterns\n` +
    `• Tactical guidance and recommendations\n\n` +
    `Ask about any of these areas for detailed intelligence.`;
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
