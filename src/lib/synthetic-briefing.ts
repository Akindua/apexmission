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
  
  // Greeting based on time of day
  const timeGreeting = getTimeGreeting(currentHour);
  const firstName = userName.split(" ")[0];
  
  if (isFirstSignup) {
    // Onboarding briefing for first-time users
    messages.push({
      role: "assistant",
      content: `Welcome to ApexMission Command Terminal, ${firstName}. I am your Mission Coach.`

    });
    
    messages.push({
      role: "assistant",
      content: `INITIATING OPERATIONAL BRIEFING. \n\nYour current rank: ${userRank}\n\n${timeGreeting}, Operator. Let me guide you through your mission architecture.`
    });
    
    messages.push({
      role: "assistant",
      content: `⚡ MISSION CORE: ${state.mission || "No mission directive established yet. Initiate your master vision statement to begin operations."}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎯 HIGH-IMPACT EXECUTION: ${getTaskSummary(state.tasks?.high || [], "HIGH")}`
    });
    
    messages.push({
      role: "assistant",
      content: `📊 MEDIUM-IMPACT: ${getTaskSummary(state.tasks?.medium || [], "MEDIUM")}`
    });
    
    messages.push({
      role: "assistant",
      content: `🔧 LOW-IMPACT: ${getTaskSummary(state.tasks?.low || [], "LOW")}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎖️ DAILY DIRECTIVE: ${state.daily?.action || "No daily action assigned. Establish your focus target."}`
    });
    
    messages.push({
      role: "assistant",
      content: `OPERATIONAL STATUS REPORT:\n` +
        `• Credits: ${(state as any).points || 0}\n` +
        `• Streak: ${state.streak?.count || 0} days\n` +
        `• Leaderboard Position: ${userRank}\n\n` +
        `Begin your execution. Complete high-impact objectives to advance your rank. I will monitor your progress and provide tactical guidance.`
    });
    
  } else {
    // Sign-in briefing for returning users
    const operationalStatus = getOperationalStatus(state);
    const taskCompletionRate = calculateTaskCompletionRate(state);
    const productivityPhase = getProductivityPhase(currentHour);
    
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
        `• Current Streak: ${state.streak?.count || 0} days\n` +
        `• Credits Accumulated: ${(state as any).points || 0}\n` +
        `• Leaderboard Position: ${userRank}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎯 MISSION PROGRESS:\n` +
        `• Master Vision: ${state.mission ? "ACTIVE" : "PENDING INITIALIZATION"}\n` +
        `• High-Impact Tasks: ${getTaskCompletionSummary(state.tasks?.high || [])}\n` +
        `• Medium-Impact: ${getTaskCompletionSummary(state.tasks?.medium || [])}\n` +
        `• Low-Impact: ${getTaskCompletionSummary(state.tasks?.low || [])}`
    });
    
    messages.push({
      role: "assistant",
      content: `🎖️ DAILY DIRECTIVE: ${state.daily?.action || "No daily action assigned"}\n` +
        `Status: ${state.daily?.done ? "✅ COMPLETED" : "⏳ PENDING"}`
    });
    
    if (state.reflection) {
      messages.push({
        role: "assistant",
        content: `📝 REFLECTION DATA:\n` +
          `• Last Win: ${state.reflection.win || "No recent win recorded"}\n` +
          `• Active Blocker: ${state.reflection.blocker || "No blockers identified"}\n` +
          `• Tomorrow's Focus: ${state.reflection.tomorrow || "Not specified"}`
      });
    }
    
    // Behavioral analysis
    if (behaviorAnalytics.sessionCount > 0) {
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
    
    // Tactical guidance based on current state
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

function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "GOOD MORNING";
  if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
  if (hour >= 17 && hour < 21) return "GOOD EVENING";
  return "OPERATOR";
}

function getTaskSummary(tasks: any[], tier: string): string {
  if (!tasks || tasks.length === 0) return `No ${tier.toLowerCase()}-impact execution objects mapped.`;
  const completed = tasks.filter((t: any) => t.done).length;
  return `${completed}/${tasks.length} execution objects ${completed === tasks.length ? "✅ COMPLETE" : "⏳ IN PROGRESS"}`;
}

function getTaskCompletionSummary(tasks: any[]): string {
  if (!tasks || tasks.length === 0) return "None assigned";
  const completed = tasks.filter((t: any) => t.done).length;
  return `${completed}/${tasks.length} completed`;
}

function getOperationalStatus(state: any): string {
  const failures = (state as any).failureCount || 0;
  if (failures >= 5) return "🔴 FALLEN - Critical intervention required";
  if (failures >= 3) return "🟡 AT RISK - Performance degraded";
  return "🟢 OPERATIONAL - Elite execution mode";
}

function calculateTaskCompletionRate(state: any): number {
  const allTasks = [
    ...(state.tasks?.high || []),
    ...(state.tasks?.medium || []),
    ...(state.tasks?.low || [])
  ];
  if (allTasks.length === 0) return 0;
  const completed = allTasks.filter((t: any) => t.done).length;
  return Math.round((completed / allTasks.length) * 100);
}

function getProductivityPhase(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning Peak Phase";
  if (hour >= 12 && hour < 17) return "Afternoon Execution Phase";
  if (hour >= 17 && hour < 21) return "Evening Review Phase";
  return "Night Recharge Phase";
}

function getInsightLevel(sessionCount: number): string {
  if (sessionCount >= 10) return "ADVANCED - Elite tactical awareness";
  if (sessionCount >= 5) return "INTERMEDIATE - Operational competence";
  return "BASIC - Initial training phase";
}

function generateTacticalGuidance(state: any, analytics: any, hour: number): string {
  const guidance: string[] = [];
  
  // Check mission status
  if (!state.mission) {
    guidance.push("• CRITICAL: Establish your Master Vision Statement to initiate mission parameters");
  }
  
  // Check daily action
  if (!state.daily?.action) {
    guidance.push("• PRIORITY: Define your daily focus action for maximum impact");
  } else if (!state.daily?.done) {
    guidance.push("• EXECUTE: Complete your daily focus action to maintain streak momentum");
  }
  
  // Check high-impact tasks
  const highTasks = state.tasks?.high || [];
  const pendingHigh = highTasks.filter((t: any) => !t.done).length;
  if (pendingHigh > 0) {
    guidance.push(`• FOCUS: ${pendingHigh} high-impact execution object${pendingHigh > 1 ? 's' : ''} pending`);
  }
  
  // Check streak
  const streak = state.streak?.count || 0;
  if (streak === 0) {
    guidance.push("• MOMENTUM: Execute daily action to build your operational streak");
  } else if (streak >= 7) {
    guidance.push("• ELITE: Maintain your 7+ day streak for maximum point multiplier");
  }
  
  // Check procrastination
  if (analytics.procrastinationEvents > 3) {
    guidance.push("• WARNING: Procrastination metrics elevated. Re-align focus immediately");
  }
  
  // Time-based guidance
  if (hour >= 5 && hour < 12) {
    guidance.push("• PHASE: Morning peak - Execute high-impact objectives now");
  } else if (hour >= 12 && hour < 17) {
    guidance.push("• PHASE: Afternoon execution - Maintain momentum on pending tasks");
  } else if (hour >= 17 && hour < 21) {
    guidance.push("• PHASE: Evening review - Assess progress and plan tomorrow");
  }
  
  return guidance.length > 0 ? guidance.join("\n") : "• STATUS: All systems operational. Continue execution.";
}
