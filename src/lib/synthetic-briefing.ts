/**
 * Zero-API Synthetic Briefing Engine
 *
 * Generates deterministic, military-style operator briefings without spending
 * AI API credits. The engine is split into two responsibilities:
 *
 *  1. Pulling operator telemetry from Supabase (profile metadata + the
 *     authenticated leaderboard RPC).
 *  2. Turning that telemetry into a disciplined, track-aware briefing.
 *
 * Personal operators (company_id IS NULL) receive rank + leaderboard
 * intelligence. Corporate operators (company_id IS NOT NULL) receive the
 * exact same execution analysis but zero leaderboard/public ranking telemetry.
 */

import { supabase } from "@/integrations/supabase/client";

export interface OperatorProfileMetadata {
  id: string;
  operatorName: string;
  companyId: string | null;
  onboardingCompleted: boolean;
  credits: number;
  currentStreak: number;
  maxStreak: number;
  failureCount: number;
  operationalStatus: string;
  lastActionLogged: string;
}

export interface LeaderboardOperatorRow {
  id: string;
  operator_name: string;
  full_name: string;
  credits: number;
  current_streak: number;
  max_streak: number;
  failure_count: number;
  operational_status: string;
  rank_position: number | null;
}

export interface LeaderboardSnapshot {
  rank: number | null;
  totalOperators: number;
  credits: number;
  currentStreak: number;
  leaderName: string;
  leaderCredits: number;
  leaderStreak: number;
}

export interface BehaviorAnalytics {
  sessionCount?: number;
  lastSessionDate?: string;
  totalTasksCompleted?: number;
  averageCompletionTime?: number;
  procrastinationEvents?: number;
  peakProductivityHour?: number;
  totalMessagesExchanged?: number;
  streakConsistency?: number;
  preferredFocusAreas?: string[];
  /** Real task-closure events: ISO date key + task label, newest last. */
  taskHistory?: Array<{ date: string; text?: string }>;
}

export interface OperatorProfileMetadata {
  id: string;
  operatorName: string;
  companyId: string | null;
  onboardingCompleted: boolean;
  credits: number;
  currentStreak: number;
  maxStreak: number;
  failureCount: number;
  operationalStatus: string;
  lastActionLogged: string;
  taskHistory?: Array<{ date: string; text?: string }> | null;
  velocityScore?: number | null;
}

export interface UserContext {
  userName: string;
  operatorName?: string;
  userRank?: string;
  state: any;
  behaviorAnalytics?: BehaviorAnalytics | null;
  isFirstSignup: boolean;
  currentHour: number;
  companyId?: string | null;
  profile?: OperatorProfileMetadata | null;
  leaderboard?: LeaderboardSnapshot | null;
}

export interface BriefingMessage {
  role: "user" | "assistant";
  content: string;
}

export type DisciplineSeverity = "LOW" | "ELEVATED" | "CRITICAL";

export interface DisciplineAudit {
  severity: DisciplineSeverity;
  habits: string[];
  assessment: string;
}

export interface TacticalDossier {
  generatedAt: string;
  callSign: string;
  timeGreeting: string;
  track: "PERSONAL OPERATOR" | "CORPORATE OPERATOR";
  rank: string;
  operationalStatus: string;
  mission: string;
  missionDeclared: boolean;
  dailyAction: string;
  dailyDone: boolean;
  streak: number;
  maxStreak: number;
  credits: number;
  failures: number;
  totalTasks: number;
  completedTasks: number;
  executionRate: number;
  pendingHighImpact: number;
  pendingHighImpactTitles: string[];
  riskLevel: DisciplineSeverity;
  riskHabits: string[];
  riskAssessment: string;
  reflection: {
    morningCount: number;
    nightCount: number;
    assessment: string;
    nextVelocity: string;
  };
  leaderboard: {
    rank: number | null;
    totalOperators: number;
    leaderName: string;
    leaderCredits: number;
    creditGap: number | null;
  } | null;
  nextObjective: string;
  nextFocus: "mission" | "daily" | "high" | "matrix";
  directive: string[];
  sections: BriefingMessage[];
}

/** Session marker used to auto-open the returning-login dossier once. */
export const TACTICAL_BRIEFING_SESSION_KEY = "apex-session-tactical-briefing";

interface TierSummary {
  total: number;
  completed: number;
  pending: number;
  pendingTitles: string[];
}

interface TaskTrends {
  high: TierSummary;
  medium: TierSummary;
  low: TierSummary;
  total: number;
  completed: number;
  completionRate: number;
  pendingHighImpact: number;
}

interface ReflectionHistoryEntry {
  date?: string;
  phase?: "morning" | "night";
  wins?: string;
  blockers?: string;
  tomorrowAction?: string;
  dailyAction?: string;
  actionCompleted?: boolean | null;
  routineSealed?: number;
  createdAt?: string;
}

interface ReflectionDebrief {
  morningCount: number;
  nightCount: number;
  morningDeclaration: string;
  nightCloseout: string;
  wins: string;
  deficits: string;
  intel: string;
  nextVelocity: string;
  assessment: string;
}

interface ProcrastinationAudit {
  severity: "LOW" | "ELEVATED" | "CRITICAL";
  habits: string[];
  assessment: string;
}

/* -------------------------------------------------------------------------- */
/* SUPABASE TELEMETRY LOADERS                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Pulls the authenticated operator's profile metadata for the synthetic
 * greeting. Returns null when the profile row cannot be resolved so the app
 * can fall back to auth metadata without crashing the session.
 */
export async function fetchOperatorProfileMetadata(
  userId: string,
): Promise<OperatorProfileMetadata | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, company_id, onboarding_completed, credits, current_streak, max_streak, failure_count, operational_status, last_action_logged, task_history, velocity_score",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[SyntheticBriefing] Profile telemetry query failed:", error);
    return null;
  }

  if (!data) return null;

  const emailHandle = data.email ? data.email.split("@")[0] : "";
  const operatorName = (data.full_name || emailHandle || "OPERATOR").trim();

  return {
    id: data.id,
    operatorName,
    companyId: data.company_id ?? null,
    onboardingCompleted: Boolean(data.onboarding_completed),
    credits: Number(data.credits ?? 0),
    currentStreak: Number(data.current_streak ?? 0),
    maxStreak: Number(data.max_streak ?? 0),
    failureCount: Number(data.failure_count ?? 0),
    operationalStatus: data.operational_status || "OPERATIONAL",
    lastActionLogged: data.last_action_logged || "",
    taskHistory: Array.isArray(data.task_history) ? (data.task_history as Array<{ date: string; text?: string }>) : [],
    velocityScore: data.velocity_score == null ? null : Number(data.velocity_score),
  };
}

/**
 * Queries the database leaderboard through a SECURITY DEFINER RPC so all
 * authenticated operators get the same ranked ledger without exposing the
 * private columns on public.profiles. Falls back to a direct profile query if
 * the RPC has not been deployed yet.
 */
export async function fetchLeaderboardTelemetry(userId: string | null): Promise<{
  operators: LeaderboardOperatorRow[];
  snapshot: LeaderboardSnapshot | null;
}> {
  let operators: LeaderboardOperatorRow[] = [];
  let rankedTelemetry = false;

  try {
    const { data, error } = await supabase.rpc("get_operator_leaderboard");
    if (error) throw error;
    rankedTelemetry = true;

    operators = (data || []).map((row: any, index: number) => ({
      id: String(row.id),
      operator_name: String(row.operator_name || "OPERATOR"),
      full_name: String(row.operator_name || "OPERATOR"),
      credits: Number(row.credits ?? 0),
      current_streak: Number(row.current_streak ?? 0),
      max_streak: Number(row.max_streak ?? 0),
      failure_count: Number(row.failure_count ?? 0),
      operational_status: String(row.operational_status || "OPERATIONAL"),
      rank_position:
        row.rank_position === null || row.rank_position === undefined
          ? index + 1
          : Number(row.rank_position),
    }));
  } catch (rpcError) {
    console.warn("[SyntheticBriefing] Ranked RPC unavailable, using profile fallback:", rpcError);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, credits, current_streak, max_streak, failure_count, operational_status",
      )
      .order("credits", { ascending: false });

    if (error) {
      console.error("[SyntheticBriefing] Leaderboard fallback query failed:", error);
      return { operators, snapshot: null };
    }

    operators = (data || []).map((row: any, index: number) => {
      const emailHandle = row.email ? String(row.email).split("@")[0] : "";
      const name = String(row.full_name || emailHandle || "OPERATOR");
      return {
        id: String(row.id),
        operator_name: name,
        full_name: name,
        credits: Number(row.credits ?? 0),
        current_streak: Number(row.current_streak ?? 0),
        max_streak: Number(row.max_streak ?? 0),
        failure_count: Number(row.failure_count ?? 0),
        operational_status: String(row.operational_status || "OPERATIONAL"),
        rank_position: index + 1,
      };
    });
  }

  if (!userId || operators.length === 0 || !rankedTelemetry) {
    return { operators, snapshot: null };
  }

  const ownIndex = operators.findIndex((operator) => operator.id === userId);
  const ownOperator = ownIndex >= 0 ? operators[ownIndex] : null;
  const leader = operators[0];

  if (!leader) {
    return { operators, snapshot: null };
  }

  return {
    operators,
    snapshot: {
      rank: ownOperator?.rank_position ?? (ownIndex >= 0 ? ownIndex + 1 : null),
      totalOperators: operators.length,
      credits: ownOperator?.credits ?? 0,
      currentStreak: ownOperator?.current_streak ?? 0,
      leaderName: leader.operator_name,
      leaderCredits: leader.credits,
      leaderStreak: leader.current_streak,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* BRIEFING GENERATION                                                         */
/* -------------------------------------------------------------------------- */

export function generateSyntheticBriefing(context: UserContext): BriefingMessage[] {
  const {
    userName,
    state,
    behaviorAnalytics,
    isFirstSignup,
    currentHour,
    profile = null,
  } = context;

  const companyId = context.companyId ?? profile?.companyId ?? null;
  const isCorporate = Boolean(companyId);
  const operatorName = (
    context.operatorName ||
    profile?.operatorName ||
    userName ||
    "OPERATOR"
  ).trim();
  const callSign = operatorName.toUpperCase();
  const timeGreeting = getTimeGreeting(currentHour);
  const displayRank = context.userRank || "UNRANKED";

  // Corporate tracks must never receive public ranking telemetry, even if a
  // caller accidentally passes it through.
  const leaderboard = isCorporate ? null : context.leaderboard || null;
  const taskTrends = getTaskTrends(state);
  const reflectionDebrief = getReflectionDebrief(state);
  const procrastinationAudit = getProcrastinationAudit(
    state,
    behaviorAnalytics,
    profile,
    taskTrends,
    currentHour,
  );

  if (isFirstSignup) {
    return generateOnboardingTutorial({
      callSign,
      timeGreeting,
      isCorporate,
      displayRank,
      taskTrends,
      reflectionDebrief,
      procrastinationAudit,
      leaderboard,
      state,
    });
  }

  return generateReturningBriefing({
    callSign,
    timeGreeting,
    isCorporate,
    displayRank,
    taskTrends,
    reflectionDebrief,
    procrastinationAudit,
    leaderboard,
    state,
  });
}

/**
 * Deterministic discipline audit shared by the tactical dossier and the
 * API-backed coach. No network calls, no AI keys.
 */
export function analyzeOperatorDiscipline(context: {
  state: any;
  behaviorAnalytics?: BehaviorAnalytics | null;
  profile?: OperatorProfileMetadata | null;
  currentHour?: number;
}): DisciplineAudit {
  const currentHour = context.currentHour ?? new Date().getHours();
  const trends = getTaskTrends(context.state);
  return getProcrastinationAudit(
    context.state,
    context.behaviorAnalytics,
    context.profile ?? null,
    trends,
    currentHour,
  );
}

/**
 * Builds the structured, non-chat dossier used by the returning-login
 * TacticalBriefing screen. Every field is derived locally from telemetry that
 * the dashboard has already loaded.
 */
export function generateTacticalDossier(context: UserContext): TacticalDossier {
  const {
    userName,
    state,
    behaviorAnalytics,
    currentHour,
    profile = null,
  } = context;

  const companyId = context.companyId ?? profile?.companyId ?? null;
  const isCorporate = Boolean(companyId);
  const operatorName = (
    context.operatorName ||
    profile?.operatorName ||
    userName ||
    "OPERATOR"
  ).trim();
  const callSign = operatorName.toUpperCase();
  const displayRank = context.userRank || "UNRANKED";
  const leaderboard = isCorporate ? null : context.leaderboard || null;
  const taskTrends = getTaskTrends(state);
  const reflectionDebrief = getReflectionDebrief(state);
  const procrastinationAudit = getProcrastinationAudit(
    state,
    behaviorAnalytics,
    profile,
    taskTrends,
    currentHour,
  );
  const mission = cleanText(state?.mission);
  const dailyAction = cleanText(state?.daily?.text);
  const dailyDone = Boolean(state?.daily?.done);
  const streak = Number(state?.streak?.count ?? profile?.currentStreak ?? 0);
  const maxStreak = Math.max(streak, Number(profile?.maxStreak ?? 0));
  const credits = Number(profile?.credits ?? state?.points ?? 0);
  const failures = Number(profile?.failureCount ?? state?.failureCount ?? 0);

  const operationalStatus =
    profile?.operationalStatus ||
    (failures >= 5
      ? "FALLEN"
      : failures >= 3
        ? "AT RISK"
        : "OPERATIONAL");

  const directive = getTacticalDirective(
    taskTrends,
    procrastinationAudit,
    state,
    isCorporate,
  )
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  const nextObjective = mission
    ? taskTrends.high.pendingTitles[0] ||
      (dailyAction && !dailyDone ? dailyAction : "") ||
      "Plan and execute the next high-impact operation."
    : "Declare the Master Vision before executing another task.";

  const nextFocus: TacticalDossier["nextFocus"] = !mission
    ? "mission"
    : dailyAction && !dailyDone
      ? "daily"
      : taskTrends.pendingHighImpact > 0
        ? "high"
        : "matrix";

  return {
    generatedAt: new Date().toISOString(),
    callSign,
    timeGreeting: getTimeGreeting(currentHour),
    track: isCorporate ? "CORPORATE OPERATOR" : "PERSONAL OPERATOR",
    rank: displayRank,
    operationalStatus,
    mission: mission || "NOT DECLARED",
    missionDeclared: Boolean(mission),
    dailyAction: dailyAction || "NO DAILY ACTION ASSIGNED",
    dailyDone,
    streak,
    maxStreak,
    credits,
    failures,
    totalTasks: taskTrends.total,
    completedTasks: taskTrends.completed,
    executionRate: taskTrends.completionRate,
    pendingHighImpact: taskTrends.pendingHighImpact,
    pendingHighImpactTitles: taskTrends.high.pendingTitles,
    riskLevel: procrastinationAudit.severity,
    riskHabits: procrastinationAudit.habits,
    riskAssessment: procrastinationAudit.assessment,
    reflection: {
      morningCount: reflectionDebrief.morningCount,
      nightCount: reflectionDebrief.nightCount,
      assessment: reflectionDebrief.assessment,
      nextVelocity: reflectionDebrief.nextVelocity,
    },
    leaderboard: leaderboard
      ? {
          rank: leaderboard.rank,
          totalOperators: leaderboard.totalOperators,
          leaderName: leaderboard.leaderName,
          leaderCredits: leaderboard.leaderCredits,
          creditGap:
            leaderboard.rank === null ? null : Math.max(0, leaderboard.leaderCredits - credits),
        }
      : null,
    nextObjective,
    nextFocus,
    directive:
      directive.length > 0 ? directive : ["All systems green. Continue elite execution."],
    sections: generateReturningBriefing({
      callSign,
      timeGreeting: getTimeGreeting(currentHour),
      isCorporate,
      displayRank,
      taskTrends,
      reflectionDebrief,
      procrastinationAudit,
      leaderboard,
      state,
    }),
  };
}

interface BriefingParts {
  callSign: string;
  timeGreeting: string;
  isCorporate: boolean;
  displayRank: string;
  taskTrends: TaskTrends;
  reflectionDebrief: ReflectionDebrief;
  procrastinationAudit: ProcrastinationAudit;
  leaderboard: LeaderboardSnapshot | null;
  state: any;
}

function generateOnboardingTutorial(parts: BriefingParts): BriefingMessage[] {
  const {
    callSign,
    timeGreeting,
    isCorporate,
    taskTrends,
    reflectionDebrief,
    procrastinationAudit,
    leaderboard,
    state,
  } = parts;

  const track = isCorporate ? "CORPORATE EMPLOYEE" : "PERSONAL OPERATOR";
  const messages: BriefingMessage[] = [];

  messages.push({
    role: "assistant",
    content: `${timeGreeting}, OPERATOR ${callSign}.

COMMS CHANNEL: SECURE
SERVICE RECORD: VERIFIED
TRACK: ${track}
ONBOARDING STATE: FIRST SESSION — NON-RECURRING

I am Mission Coach. I do not motivate. I assess, correct, and direct. This is your first and only onboarding briefing. Stand by for baseline audit.`,
  });

  messages.push({
    role: "assistant",
    content: buildPerformanceReport(taskTrends, isCorporate, parts.displayRank),
  });

  if (!isCorporate) {
    messages.push({
      role: "assistant",
      content: buildRankAssessment(leaderboard, parts.displayRank),
    });
  }

  messages.push({
    role: "assistant",
    content: buildReflectionDebrief(reflectionDebrief),
  });

  messages.push({
    role: "assistant",
    content: buildProcrastinationReport(procrastinationAudit),
  });

  messages.push({
    role: "assistant",
    content: buildPriorityMatrix(state, taskTrends, isCorporate),
  });

  messages.push({
    role: "assistant",
    content: buildInterfaceBriefing(isCorporate),
  });

  messages.push({
    role: "assistant",
    content: `ONBOARDING COMPLETE, OPERATOR ${callSign}.

Your onboarding flag is being written to the operator profile database now. It will be set to TRUE permanently. You will not receive this briefing again on future logins.

STANDING ORDERS:
1. Execute the highest-impact objective before anything else.
2. Close the night reflection every day. Do not leave the record blank.
3. Review the Priority Matrix each morning and adjust fire.
4. Report to your workspace. Execute with discipline.

Mission Coach out.`,
  });

  return messages;
}

function generateReturningBriefing(parts: BriefingParts): BriefingMessage[] {
  const {
    callSign,
    timeGreeting,
    isCorporate,
    taskTrends,
    reflectionDebrief,
    procrastinationAudit,
    leaderboard,
    state,
  } = parts;

  const messages: BriefingMessage[] = [
    {
      role: "assistant",
      content: `${timeGreeting}, OPERATOR ${callSign}.

COMMS CHANNEL: SECURE
TRACK: ${isCorporate ? "CORPORATE EMPLOYEE" : "PERSONAL OPERATOR"}
ONBOARDING STATE: COMPLETE

Mission Coach reporting. Standing by with your current operational brief.`,
    },
    {
      role: "assistant",
      content: buildPerformanceReport(taskTrends, isCorporate, parts.displayRank),
    },
  ];

  if (!isCorporate) {
    messages.push({
      role: "assistant",
      content: buildRankAssessment(leaderboard, parts.displayRank),
    });
  }

  messages.push(
    {
      role: "assistant",
      content: buildReflectionDebrief(reflectionDebrief),
    },
    {
      role: "assistant",
      content: buildProcrastinationReport(procrastinationAudit),
    },
    {
      role: "assistant",
      content: buildPriorityMatrix(state, taskTrends, isCorporate),
    },
  );

  const directive = getTacticalDirective(taskTrends, procrastinationAudit, state, isCorporate);

  messages.push({
    role: "assistant",
    content: `TACTICAL DIRECTIVE:\n${directive}\n\nEXECUTE YOUR OBJECTIVES. I am monitoring your performance.`,
  });

  return messages;
}

/* -------------------------------------------------------------------------- */
/* ANALYSIS BUILDERS                                                          */
/* -------------------------------------------------------------------------- */

function buildPerformanceReport(
  trends: TaskTrends,
  isCorporate: boolean,
  displayRank: string,
): string {
  const assessment =
    trends.total === 0
      ? "CRITIQUE: No task matrix exists. An operator without objectives is not executing; you are idling. Populate the Priority Matrix immediately."
      : trends.completionRate >= 75 && trends.high.pending === 0
        ? "PRAISE: Execution density is high and no high-impact objectives are unresolved. Maintain this standard."
        : trends.completionRate >= 45
          ? "CONDITIONAL: Execution is serviceable but not elite. Pending high-impact work is still exposed."
          : "CRITIQUE: Execution rate is below standard. The trend shows avoidance, not workload pressure. Correct it today.";

  const trackLine = isCorporate
    ? "TRACK: CORPORATE EMPLOYEE — task completion trends only."
    : `TRACK: PERSONAL OPERATOR — rank telemetry: ${displayRank}`;

  return `PERFORMANCE BASELINE — TASK COMPLETION TRENDS

${trackLine}

HIGH IMPACT:    ${formatTier(trends.high)}
MEDIUM IMPACT:  ${formatTier(trends.medium)}
LOW IMPACT:     ${formatTier(trends.low)}

EXECUTION RATE: ${trends.completionRate}% (${trends.completed}/${trends.total} objectives complete)
PENDING HIGH-IMPACT: ${trends.pendingHighImpact}

ASSESSMENT: ${assessment}`;
}

function buildRankAssessment(leaderboard: LeaderboardSnapshot | null, displayRank: string): string {
  if (!leaderboard || leaderboard.totalOperators === 0) {
    return `RANK ASSESSMENT: CRITIQUE — INTELLIGENCE GAP.

Leaderboard query returned no ranked operators. Current ledger position: ${displayRank}.

CRITIQUE: You cannot be praised for a position that does not exist. Log measurable output, climb the ledger, and report back with a real rank.`;
  }

  const { rank, totalOperators, credits, currentStreak, leaderName, leaderCredits, leaderStreak } =
    leaderboard;

  if (rank === null) {
    return `RANK ASSESSMENT: CRITIQUE — UNRANKED.

CRITIQUE: You are not present on the leaderboard. ${totalOperators} operators are ranked; you are not one of them. That is a visibility failure. Execute and sync your ledger.

LEADER: ${leaderName} — ${leaderCredits} credits, ${leaderStreak}-day streak.`;
  }

  const position = `#${rank} of ${totalOperators}`;
  const creditGap = Math.max(0, leaderCredits - credits);
  const percentile =
    totalOperators <= 1 ? 100 : Math.round(((totalOperators - rank + 1) / totalOperators) * 100);

  if (rank === 1) {
    return `RANK ASSESSMENT: PRAISE.

POSITION: ${position}
CREDITS: ${credits}
CURRENT STREAK: ${currentStreak} days
PERCENTILE: ${percentile}th

You hold the network's number one position. That is the standard, not a resting point. Every operator below you is hunting your ledger. Defend it with execution, not complacency.`;
  }

  if (rank <= 3) {
    return `RANK ASSESSMENT: PRAISE.

POSITION: ${position}
CREDITS: ${credits}
PERCENTILE: ${percentile}th
GAP TO #1: ${creditGap} credits

You are operating in the top three. That is elite territory. But ${leaderName} still owns the top ledger at ${leaderCredits} credits and a ${leaderStreak}-day streak. Close the gap or surrender the podium.`;
  }

  if (rank <= Math.ceil(totalOperators * 0.25)) {
    return `RANK ASSESSMENT: PRAISE — ABOVE STANDARD.

POSITION: ${position}
CREDITS: ${credits}
PERCENTILE: ${percentile}th
GAP TO #1: ${creditGap} credits

You sit in the top quarter of the network. Acceptable — not exceptional. ${totalOperators - rank} operators are behind you; ${rank - 1} are ahead. Take the next position.`;
  }

  if (rank <= Math.ceil(totalOperators * 0.5)) {
    return `RANK ASSESSMENT: CRITIQUE — MARGINAL.

POSITION: ${position}
CREDITS: ${credits}
PERCENTILE: ${percentile}th
GAP TO #1: ${creditGap} credits

You are in the middle of the formation. That is average, and average does not survive here. ${rank - 1} operators outrank you. Pick one high-impact objective and break the tie today.`;
  }

  return `RANK ASSESSMENT: CRITIQUE.

POSITION: ${position}
CREDITS: ${credits}
PERCENTILE: ${percentile}th
GAP TO #1: ${creditGap} credits

You are in the bottom half of the leaderboard. ${totalOperators - rank} operators are behind you; ${rank - 1} are ahead. The current trajectory is not competitive. Stop negotiating with low-value work and execute the Priority Matrix.

LEADER: ${leaderName} — ${leaderCredits} credits, ${leaderStreak}-day streak.`;
}

function buildReflectionDebrief(debrief: ReflectionDebrief): string {
  const logCount = debrief.morningCount + debrief.nightCount;

  if (logCount === 0) {
    return `REFLECTION DEBRIEF — MORNING / NIGHT LOGS

STATUS: NO REFLECTION RECORDS ON FILE.

CRITIQUE: You are operating without a debrief trail. That is a discipline failure. A morning declaration without a night closeout is incomplete; a night closeout without a next action is useless.

MORNING DECLARATION: ${debrief.morningDeclaration}
NIGHT CLOSEOUT: ${debrief.nightCloseout}

From this session forward, log both. No exceptions.`;
  }

  return `REFLECTION DEBRIEF — MORNING / NIGHT LOGS

RECORDS PARSED: ${debrief.morningCount} morning, ${debrief.nightCount} night
MORNING DECLARATION: ${debrief.morningDeclaration}
NIGHT CLOSEOUT: ${debrief.nightCloseout}
WINS: ${debrief.wins}
DEFICITS: ${debrief.deficits}
ACQUIRED INTEL: ${debrief.intel}
NEXT VELOCITY BLOCK: ${debrief.nextVelocity}

ASSESSMENT: ${debrief.assessment}`;
}

function buildProcrastinationReport(audit: ProcrastinationAudit): string {
  const habits =
    audit.habits.length > 0
      ? audit.habits.map((habit) => `- ${habit}`).join("\n")
      : "- No active avoidance pattern detected.";

  return `PROCRASTINATION AUDIT — ACTIVE HABITS

THREAT LEVEL: ${audit.severity}

${habits}

ASSESSMENT: ${audit.assessment}`;
}

function buildPriorityMatrix(state: any, trends: TaskTrends, isCorporate: boolean): string {
  const mission = cleanText(state?.mission) || "NOT DECLARED — CRITICAL GAP";
  const dailyText = cleanText(state?.daily?.text) || "NO DAILY ACTION ASSIGNED";
  const dailyStatus = state?.daily?.done ? "EXECUTED" : "PENDING";
  const streak = Number(state?.streak?.count ?? 0);

  const orders: string[] = [];

  if (!cleanText(state?.mission)) {
    orders.push("Declare the Master Vision immediately. No vision, no mission.");
  }

  if (trends.high.pending > 0) {
    orders.push(
      `Neutralize ${trends.high.pending} pending high-impact objective${trends.high.pending > 1 ? "s" : ""}: ${trends.high.pendingTitles.map((title) => `"${title}"`).join(", ")}.`,
    );
  }

  if (!state?.daily?.done) {
    orders.push(`Execute the daily action: "${dailyText}". It is currently ${dailyStatus}.`);
  }

  if (trends.total === 0) {
    orders.push("Populate the Priority Matrix with at least one high-impact objective.");
  }

  if (orders.length === 0) {
    orders.push("All matrix objectives are closed. Plan the next high-impact operation.");
  }

  return `PRIORITY MATRIX — DAILY MISSION PARAMETERS

TRACK: ${isCorporate ? "CORPORATE EMPLOYEE" : "PERSONAL OPERATOR"}
MASTER VISION: ${mission}
DAILY ACTION: "${dailyText}" — ${dailyStatus}
STREAK: ${streak} days

HIGH IMPACT:   ${formatTier(trends.high)}
  ${formatPendingTitles(trends.high)}
MEDIUM IMPACT: ${formatTier(trends.medium)}
  ${formatPendingTitles(trends.medium)}
LOW IMPACT:    ${formatTier(trends.low)}
  ${formatPendingTitles(trends.low)}

MISSION ORDERS:
${orders.map((order, index) => `${index + 1}. ${order}`).join("\n")}`;
}

function buildInterfaceBriefing(isCorporate: boolean): string {
  const modules = isCorporate
    ? `- WORKSPACE: Primary mission dashboard, Priority Matrix, and daily focus action.
- COACH: Strategic performance mentor and document parser.
- HARDWARE: Tactical store for themes, badges, and streak shields.
- SUPPORT: Direct operational assistance.`
    : `- WORKSPACE: Primary mission dashboard, Priority Matrix, and daily focus action.
- RANKS: Live public leaderboard and network operator standings.
- HARDWARE: Tactical store for themes, badges, and streak shields.
- COACH: Strategic performance mentor and document parser.
- SUPPORT: Direct operational assistance.`;

  return `COMMAND TERMINAL — INTERFACE BRIEFING

Your console is divided into the following modules:

${modules}

CONTROL STANDARDS:
1. One mission. One daily action. One Priority Matrix.
2. High-impact work executes first. Medium and low-impact work fills the gaps.
3. The night reflection is mandatory. Data drives the next morning's orders.

Learn the layout. Then execute.`;
}

/* -------------------------------------------------------------------------- */
/* TELEMETRY PARSERS                                                          */
/* -------------------------------------------------------------------------- */

function getTaskTrends(state: any): TaskTrends {
  const high = summarizeTier(state?.tasks?.high || []);
  const medium = summarizeTier(state?.tasks?.medium || []);
  const low = summarizeTier(state?.tasks?.low || []);
  const total = high.total + medium.total + low.total;
  const completed = high.completed + medium.completed + low.completed;

  return {
    high,
    medium,
    low,
    total,
    completed,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    pendingHighImpact: high.pending,
  };
}

function summarizeTier(tasks: any[]): TierSummary {
  const completed = tasks.filter((task: any) => Boolean(task?.done)).length;
  const pendingTitles = tasks
    .filter((task: any) => !task?.done)
    .map((task: any) => cleanText(task?.text))
    .filter(Boolean)
    .slice(0, 3);

  return {
    total: tasks.length,
    completed,
    pending: tasks.length - completed,
    pendingTitles,
  };
}

/**
 * Buckets the operator's real task-closure history into per-day completion
 * averages. Each entry is a task closure stamped with its execution date, so
 * the returned series is the operator's true daily completion cadence.
 */
export function computeDailyCompletions(
  taskHistory?: Array<{ date?: string; text?: string }> | null,
): Array<{ date: string; completions: number }> {
  const history = Array.isArray(taskHistory) ? taskHistory : [];
  const completionsByDate = new Map<string, number>();

  for (const entry of history) {
    const date = entry?.date;
    if (!date) continue;
    completionsByDate.set(date, (completionsByDate.get(date) ?? 0) + 1);
  }

  return Array.from(completionsByDate.entries())
    .map(([date, completions]) => ({ date, completions }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Average number of task closures per active execution day across the tracked
 * window. Returns 0 when no closure history exists yet.
 */
export function computeAverageCompletionsPerDay(
  taskHistory?: Array<{ date?: string; text?: string }> | null,
): number {
  const daily = computeDailyCompletions(taskHistory);
  if (daily.length === 0) return 0;
  const totalCompletions = daily.reduce((sum, day) => sum + day.completions, 0);
  return Math.round((totalCompletions / daily.length) * 10) / 10;
}

function getReflectionDebrief(state: any): ReflectionDebrief {
  const currentReflection = state?.reflection || {};
  const history: ReflectionHistoryEntry[] = Array.isArray(state?.reflectionHistory)
    ? state.reflectionHistory
    : [];

  const morningEntries = history
    .filter((entry) => entry?.phase === "morning")
    .sort(sortReflectionEntries)
    .slice(0, 3);
  const nightEntries = history
    .filter((entry) => entry?.phase === "night")
    .sort(sortReflectionEntries)
    .slice(0, 3);

  const currentWins = cleanText(currentReflection.wins);
  const hasCurrentNight =
    Boolean(currentWins) ||
    Boolean(cleanText(currentReflection.blockers)) ||
    Boolean(cleanText(currentReflection.tomorrowAction));

  const nightCount = nightEntries.length + (hasCurrentNight ? 1 : 0);
  const morningCount = morningEntries.length + (cleanText(state?.daily?.text) ? 1 : 0);

  const latestMorning = morningEntries[0];
  const latestNight = nightEntries[0];

  const morningDeclaration =
    cleanText(latestMorning?.dailyAction) ||
    cleanText(state?.daily?.text) ||
    "No morning declaration recorded.";

  const nightSource = [currentWins, latestNight?.wins].filter(Boolean).join("\n");

  const nightCloseout =
    cleanText(latestNight?.wins) || currentWins || "No night closeout recorded.";

  const parsedWins =
    extractStructuredField(nightSource, ["WHAT WENT WELL", "WINS", "WIN"]) ||
    cleanText(currentReflection.wins) ||
    "No win recorded.";

  const parsedDeficits =
    extractStructuredField(nightSource, ["DEFICIT AREAS", "DEFICITS", "COULD IMPROVE"]) ||
    cleanText(currentReflection.blockers) ||
    cleanText(latestNight?.blockers) ||
    "No deficit recorded.";

  const parsedIntel =
    extractStructuredField(nightSource, ["KEY ACQUIRED INTEL", "LESSONS", "INTEL"]) ||
    "No acquired intel recorded.";

  const parsedNextVelocity =
    extractStructuredField(nightSource, [
      "NEXT VELOCITY BLOCK",
      "TAKE INTO TOMORROW",
      "TOMORROW",
    ]) ||
    cleanText(currentReflection.tomorrowAction) ||
    cleanText(latestNight?.tomorrowAction) ||
    "No next action recorded.";

  const hasAnyLog = morningCount + nightCount > 0;
  const assessment = !hasAnyLog
    ? "No reflection data exists. Begin with a morning declaration and close with a night debrief tonight."
    : nightCount === 0
      ? "Morning intent is logged, but no night closeout exists. You are leaving lessons unrecorded and repeating errors."
      : morningCount === 0
        ? "Night data is logged, but no morning declaration exists. You are reacting without a daily objective."
        : parsedDeficits === "No deficit recorded."
          ? "Reflection is logged but lacks a deficit entry. Praise is withheld until you identify what failed."
          : "Reflection loop is functioning. Morning intent, night outcome, and next action are all present. Maintain the discipline.";

  return {
    morningCount,
    nightCount,
    morningDeclaration: truncate(morningDeclaration, 220),
    nightCloseout: truncate(nightCloseout, 220),
    wins: truncate(parsedWins, 220),
    deficits: truncate(parsedDeficits, 220),
    intel: truncate(parsedIntel, 220),
    nextVelocity: truncate(parsedNextVelocity, 220),
    assessment,
  };
}

function getProcrastinationAudit(
  state: any,
  analytics: BehaviorAnalytics | null | undefined,
  profile: OperatorProfileMetadata | null,
  trends: TaskTrends,
  currentHour: number,
): ProcrastinationAudit {
  const events = Number(analytics?.procrastinationEvents ?? 0);
  const failureCount = Number(profile?.failureCount ?? state?.failureCount ?? 0);
  const failedDays = Number(state?.consecutiveDaysFailedTasks ?? 0);
  const dailyPending = Boolean(state?.daily?.text) && !state?.daily?.done;
  const hasReflection =
    Boolean(cleanText(state?.reflection?.wins)) ||
    (Array.isArray(state?.reflectionHistory) && state.reflectionHistory.length > 0);
  const habits: string[] = [];

  if (events > 0) {
    habits.push(
      `${events} logged procrastination event${events > 1 ? "s" : ""}: avoidance is a recorded pattern, not a one-off.`,
    );
  }

  if (trends.pendingHighImpact > 0) {
    habits.push(
      `${trends.pendingHighImpact} high-impact objective${trends.pendingHighImpact > 1 ? "s" : ""} unresolved while lower-value work remains available.`,
    );
  }

  if (dailyPending && currentHour >= 12) {
    habits.push("Daily action deferred past the noon checkpoint.");
  } else if (dailyPending) {
    habits.push("Daily action still unexecuted inside the morning window.");
  }

  if (failureCount > 0) {
    habits.push(
      `${failureCount} penalty failure${failureCount > 1 ? "s" : ""} on the operator record.`,
    );
  }

  if (failedDays >= 2) {
    habits.push(`${failedDays}-day failed-task cascade. Momentum is degrading.`);
  }

  if (!hasReflection && (trends.total > 0 || dailyPending)) {
    habits.push("Closeout avoidance: no night reflection on record.");
  }

  if (trends.total > 0 && trends.completionRate < 40) {
    habits.push(`Low execution density: only ${trends.completionRate}% of the matrix is complete.`);
  }

  if (trends.total > 0 && Number(state?.streak?.count ?? 0) === 0 && !dailyPending) {
    habits.push("Momentum zero: streak is inactive despite an active matrix.");
  }

  const severity: ProcrastinationAudit["severity"] =
    events >= 5 || failureCount >= 5 || trends.pendingHighImpact >= 3
      ? "CRITICAL"
      : habits.length >= 2
        ? "ELEVATED"
        : "LOW";

  const assessment =
    severity === "CRITICAL"
      ? "CRITIQUE: Procrastination is now the dominant operating pattern. Immediate corrective action is required before this becomes your identity."
      : severity === "ELEVATED"
        ? "CRITIQUE: Avoidance behavior is active. It is not yet catastrophic, but it is winning. Remove one high-impact objective from the board immediately."
        : habits.length === 0
          ? "PRAISE: No active procrastination pattern detected. The discipline is intact."
          : "WATCH: Early avoidance signals are present. Correct them before they compound.";

  return { severity, habits, assessment };
}

function getTacticalDirective(
  trends: TaskTrends,
  audit: ProcrastinationAudit,
  state: any,
  isCorporate: boolean,
): string {
  const directive: string[] = [];

  if (!cleanText(state?.mission)) {
    directive.push("- CRITICAL: Declare your Master Vision before executing another task.");
  }

  if (trends.pendingHighImpact > 0) {
    directive.push(
      `- EXECUTE FIRST: ${trends.pendingHighImpact} high-impact objective${trends.pendingHighImpact > 1 ? "s" : ""} remain unresolved.`,
    );
  }

  if (!state?.daily?.done) {
    directive.push("- DAILY ACTION: Close today's single most important objective.");
  }

  if (audit.severity !== "LOW") {
    directive.push(
      `- CORRECTIVE ACTION: Threat level ${audit.severity}. Remove one avoidance habit from today's operating pattern.`,
    );
  }

  if (!isCorporate) {
    directive.push("- RANK: Check the leaderboard after execution, not before.");
  }

  return directive.length > 0
    ? directive.join("\n")
    : "- STATUS: All systems green. Continue elite execution.";
}

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "GOOD MORNING";
  if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
  if (hour >= 17 && hour < 21) return "GOOD EVENING";
  return "NIGHT WATCH";
}

function formatTier(tier: TierSummary): string {
  const rate = tier.total === 0 ? 0 : Math.round((tier.completed / tier.total) * 100);
  return `${tier.completed}/${tier.total} complete (${rate}%)`;
}

function formatPendingTitles(tier: TierSummary): string {
  if (tier.pendingTitles.length === 0) return "No pending objectives.";
  const remaining = tier.pending - tier.pendingTitles.length;
  return `Pending: ${tier.pendingTitles.map((title) => `"${title}"`).join(", ")}${
    remaining > 0 ? ` +${remaining} more` : ""
  }`;
}

function sortReflectionEntries(a: ReflectionHistoryEntry, b: ReflectionHistoryEntry): number {
  return (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || "");
}

function extractStructuredField(source: string, labels: string[]): string {
  if (!source) return "";

  const lines = source
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const upper = line.toUpperCase();
    const matchedLabel = labels.find((label) => upper.includes(label));
    if (!matchedLabel) continue;

    const value = line
      .replace(/^\d+[.)]\s*/, "")
      .replace(new RegExp(`^.*?${escapeRegExp(matchedLabel)}\\s*:?\\s*`, "i"), "")
      .trim();

    if (value) return value;
  }

  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
