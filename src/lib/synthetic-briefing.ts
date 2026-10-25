/**
 * Zero-API Synthetic Briefing Engine
 * Generates military-style automated briefings without using AI API credits
 */

interface UserContext {
  userName: string;
  userRank: string;
  state: any;
  behaviorAnalytics: any;
  isFirstSignup: boolean;
  currentHour: number;
}

interface BriefingMessage {
  role: "user" | "assistant";
  content: string;
}

export function generateSyntheticBriefing(context: UserContext): BriefingMessage[] {
  const { userName, userRank, state, behaviorAnalytics, isFirstSignup, currentHour } = context;

  const messages: BriefingMessage[] = [];
  const safeUserName = userName || "User";
  const firstName = safeUserName.split(" ")[0];
  const timeGreeting = getTimeGreeting(currentHour);

  if (isFirstSignup) {
    // Interactive onboarding tutorial for first-time users
    return generateOnboardingTutorial(firstName, userRank, state, currentHour);
  } else {
    // Sign-in briefing for returning users
    const operationalStatus = getOperationalStatus(state);
    const taskCompletionRate = calculateTaskCompletionRate(state);
    
    messages.push({
      role: "assistant",
      content: `${timeGreeting}, ${firstName}. Mission Coach reporting for duty.`
    });
    
    messages.push({
      role: "assistant",
      content: `⚡ CURRENT OPERATIONAL STATUS: ${operationalStatus}`
    });
    
    messages.push({
      role: "assistant",
      content: `📊 PERFORMANCE METRICS:\n` +
        `• Execution Rate: ${taskCompletionRate}%\n` +
        `• Current Streak: ${state?.streak?.count || 0} days\n` +
        `• Credits Accumulated: ${state?.points || 0}\n` +
        `• Leaderboard Position: ${userRank || "Global Operator Node"}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎯 MISSION PROGRESS:\n` +
        `• Master Vision: ${state?.mission ? "ACTIVE" : "PENDING INITIALIZATION"}\n` +
        `• High-Impact Tasks: ${getTaskCompletionSummary(state?.tasks?.high || [])}\n` +
        `• Medium-Impact: ${getTaskCompletionSummary(state?.tasks?.medium || [])}\n` +
        `• Low-Impact: ${getTaskCompletionSummary(state?.tasks?.low || [])}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎖️ DAILY DIRECTIVE: ${state?.daily?.text || "No daily action assigned"}\n` +
        `Status: ${state?.daily?.done ? "✅ COMPLETED" : "⏳ PENDING"}`
    });
    
    if (state?.reflection && (state.reflection.wins || state.reflection.blockers || state.reflection.tomorrowAction)) {
      messages.push({
        role: "assistant",
        content: `📝 REFLECTION DATA:\n` +
          `• Last Win: ${state.reflection.wins || "No recent win recorded"}\n` +
          `• Active Blocker: ${state.reflection.blockers || "No blockers identified"}\n` +
          `• Tomorrow's Focus: ${state.reflection.tomorrowAction || "Not specified"}`
      });
    }
    
    if (behaviorAnalytics && behaviorAnalytics.sessionCount > 0) {
      messages.push({
        role: "assistant",
        content: `🧠 BEHAVIORAL ANALYSIS:\n` +
          `• Total Sessions: ${behaviorAnalytics.sessionCount}\n` +
          `• Tasks Completed: ${behaviorAnalytics.totalTasksCompleted}\n` +
          `• Procrastination Events: ${behaviorAnalytics.procrastinationEvents}\n` +
          `• Peak Productivity Hour: ${behaviorAnalytics.peakProductivityHour}:00\n` +
          `• Insight Level: ${getInsightLevel(behaviorAnalytics.sessionCount)}`
      });
    }
    
    const tacticalGuidance = generateTacticalGuidance(state, behaviorAnalytics, currentHour);
    if (tacticalGuidance) {
      messages.push({
        role: "assistant",
        content: `⚡ TACTICAL GUIDANCE:\n${tacticalGuidance}`
      });
    }
    
    messages.push({
      role: "assistant",
      content: `EXECUTE YOUR OBJECTIVES. I am monitoring your performance and will provide real-time tactical updates. Type any tactical question for AI-powered guidance.`
    });
  }
  
  return messages;
}

function generateOnboardingTutorial(firstName: string, userRank: string, state: any, currentHour: number): BriefingMessage[] {
  const messages: BriefingMessage[] = [];
  const timeGreeting = getTimeGreeting(currentHour);

  messages.push({
    role: "assistant",
    content: `🎯 WELCOME TO APEXMISSION, ${firstName}!\n\n${timeGreeting}, Operator. I am your Mission Coach AI, and I'll guide you through the complete ApexMission Command Terminal step-by-step.`
  });

  messages.push({
    role: "assistant",
    content: `📱 APP NAVIGATION & INTERFACE\n\nApexMission is structured across core command modules:\n\n• Workspace: Your primary mission dashboard, priority task matrix, and daily focus action.\n• Ranks: Live cross-network operator standings leaderboard.\n• Hardware: Tactical store for custom themes, founder badges, and streak shields.\n• Coach: AI performance mentor & document parser.\n• Support: Direct operational assistance.`
  });

  messages.push({
    role: "assistant",
    content: `⚡ MISSION VISION & PRIORITY MATRIX\n\n• Master Vision: Declare your ultimate long-term objective at the top of your workspace.\n• High-Impact Tasks: Maximum leverage objectives (complete these first).\n• Medium-Impact Tasks: Secondary support objectives.\n• Low-Impact Tasks: Routine maintenance and logistics.`
  });

  messages.push({
    role: "assistant",
    content: `🎖️ DAILY ACTION & STREAKS\n\n• Daily Master Action: Your single most important focus for the day.\n• Streak Multiplier: Completing your daily action advances your streak and multiplies earned credits.\n• Loss Prevention: Inactive high-impact tasks trigger automated cognitive penalty audits to maintain elite discipline.`
  });

  messages.push({
    role: "assistant",
    content: `🤖 DUAL COACHING ARCHITECTURE\n\n• Zero-API Synthetic Engine: Instantly delivers instant onboarding briefings, status telemetry, and session check-ins at $0.00 cost.\n• AI Mission Coach: Provides deep Socratic guidance and document analysis on demand.\n\nYou are fully initialized and ready to operate. Review your workspace and execute with precision, ${firstName}! 🚀`
  });

  return messages;
}

function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "GOOD MORNING";
  if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
  if (hour >= 17 && hour < 21) return "GOOD EVENING";
  return "OPERATOR";
}

function getTaskCompletionSummary(tasks: any[]): string {
  if (!tasks || tasks.length === 0) return "None assigned";
  const completed = tasks.filter((t: any) => t.done).length;
  return `${completed}/${tasks.length} completed`;
}

function getOperationalStatus(state: any): string {
  const failures = state?.failureCount || 0;
  if (failures >= 5) return "🔴 FALLEN - Critical intervention required";
  if (failures >= 3) return "🟡 AT RISK - Performance degraded";
  return "🟢 OPERATIONAL - Elite execution mode";
}

function calculateTaskCompletionRate(state: any): number {
  const allTasks = [
    ...(state?.tasks?.high || []),
    ...(state?.tasks?.medium || []),
    ...(state?.tasks?.low || [])
  ];
  if (allTasks.length === 0) return 0;
  const completed = allTasks.filter((t: any) => t.done).length;
  return Math.round((completed / allTasks.length) * 100);
}

function getInsightLevel(sessionCount: number): string {
  if (sessionCount >= 10) return "ADVANCED - Elite tactical awareness";
  if (sessionCount >= 5) return "INTERMEDIATE - Operational competence";
  return "BASIC - Initial training phase";
}

function generateTacticalGuidance(state: any, analytics: any, hour: number): string {
  const guidance: string[] = [];
  
  if (!state?.mission) {
    guidance.push("• CRITICAL: Establish your Master Vision Statement to initiate mission parameters.");
  }
  
  if (!state?.daily?.text) {
    guidance.push("• PRIORITY: Define your daily focus action for maximum impact.");
  } else if (!state?.daily?.done) {
    guidance.push("• EXECUTE: Complete your daily focus action to maintain streak momentum.");
  }
  
  const highTasks = state?.tasks?.high || [];
  const pendingHigh = highTasks.filter((t: any) => !t.done).length;
  if (pendingHigh > 0) {
    guidance.push(`• FOCUS: ${pendingHigh} high-impact execution object${pendingHigh > 1 ? 's' : ''} pending.`);
  }
  
  const streak = state?.streak?.count || 0;
  if (streak === 0) {
    guidance.push("• MOMENTUM: Execute daily action to build your operational streak.");
  }
  
  return guidance.length > 0 ? guidance.join("\n") : "• STATUS: All systems operational. Continue elite execution.";
}