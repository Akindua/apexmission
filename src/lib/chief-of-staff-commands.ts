/**
 * AI Chief of Staff Command Registry — Controlled command definitions and validation.
 *
 * Defines the authorized tool schema for the realtime voice agent.
 * All commands are classified by effect level and require appropriate authorization.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

import { z } from "zod";
import type { ImpactTier, Task } from "@/lib/mission-store";
import type { ChiefOfStaffContext } from "@/services/jarvis/context-builder";

// ============================================================================
// COMMAND CLASSIFICATIONS
// ============================================================================

export type CommandCategory =
  | "read-only" // Execute after ordinary auth checks
  | "reversible-local" // Execute on clear intentional request
  | "persistent-modification" // Require explicit user approval
  | "prohibited"; // Never allowed

export interface CommandDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  name: string;
  description: string;
  category: CommandCategory;
  inputSchema: TInput;
  outputSchema: TOutput;
  requiresEnterprise?: boolean;
  // Server-side handler (implemented in the execution endpoint)
  handler: (input: z.infer<TInput>, context: CommandExecutionContext) => Promise<z.infer<TOutput>>;
}

export interface CommandExecutionContext {
  userId: string;
  token: string;
  isEnterprise: boolean;
  companyId: string | null;
  missionContext: ChiefOfStaffContext;
}

// ============================================================================
// INPUT/OUTPUT SCHEMAS (Zod schemas)
// ============================================================================

// Read-only commands
export const GetMissionContextInputSchema = z.object({});
export const GetMissionContextOutputSchema = z.object({
  mission: z.string().nullable(),
  highTasks: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  mediumTasks: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  lowTasks: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  dailyAction: z.string().nullable(),
  dailyDone: z.boolean(),
  streakCount: z.number(),
});

export const GetPrioritiesInputSchema = z.object({});
export const GetPrioritiesOutputSchema = z.object({
  high: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  medium: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  low: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  nextHighImpact: z.object({ id: z.string(), text: z.string() }).nullable(),
});

export const GetTaskDetailsInputSchema = z.object({
  taskId: z.string(),
});
export const GetTaskDetailsOutputSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    tier: z.enum(["high", "medium", "low"]),
    done: z.boolean(),
  })
  .nullable();

export const SummarizeProgressInputSchema = z.object({});
export const SummarizeProgressOutputSchema = z.object({
  summary: z.string(),
  completionRate: z.number(),
  streak: z.number(),
  nextActions: z.array(z.string()),
});

export const GetDailyActionFocusInputSchema = z.object({});
export const GetDailyActionFocusOutputSchema = z.object({
  text: z.string().nullable(),
  done: z.boolean(),
  date: z.string(),
});

// Reversible local commands
export const StartFocusTimerInputSchema = z.object({
  durationMinutes: z.number().int().min(1).max(180),
  taskContext: z.string().optional(),
});
export const StartFocusTimerOutputSchema = z.object({
  success: z.boolean(),
  timerId: z.string(),
  endTime: z.string(), // ISO timestamp
  durationMinutes: z.number(),
});

export const PauseFocusTimerInputSchema = z.object({});
export const PauseFocusTimerOutputSchema = z.object({
  success: z.boolean(),
  remainingSeconds: z.number(),
});

export const ResumeFocusTimerInputSchema = z.object({});
export const ResumeFocusTimerOutputSchema = z.object({
  success: z.boolean(),
  endTime: z.string(),
});

export const StopFocusTimerInputSchema = z.object({});
export const StopFocusTimerOutputSchema = z.object({
  success: z.boolean(),
  elapsedMinutes: z.number(),
});

// Persistent modification commands (require approval)
export const ProposeTaskCreateInputSchema = z.object({
  text: z.string().min(1).max(300),
  tier: z.enum(["high", "medium", "low"]),
  deadline: z.string().optional(), // ISO date
});
export const ProposeTaskCreateOutputSchema = z.object({
  proposed: z.boolean(),
  taskPreview: z.object({
    id: z.string(),
    text: z.string(),
    tier: z.enum(["high", "medium", "low"]),
    deadline: z.string().nullable(),
  }),
  requiresApproval: z.literal(true),
});

export const ProposeTaskUpdateInputSchema = z.object({
  taskId: z.string(),
  text: z.string().min(1).max(300).optional(),
  tier: z.enum(["high", "medium", "low"]).optional(),
  done: z.boolean().optional(),
  deadline: z.string().nullable().optional(),
});
export const ProposeTaskUpdateOutputSchema = z.object({
  proposed: z.boolean(),
  changes: z.record(z.unknown()),
  requiresApproval: z.literal(true),
});

export const ProposeMissionUpdateInputSchema = z.object({
  mission: z.string().min(1).max(500),
});
export const ProposeMissionUpdateOutputSchema = z.object({
  proposed: z.boolean(),
  currentMission: z.string().nullable(),
  proposedMission: z.string(),
  requiresApproval: z.literal(true),
});

export const GenerateBriefingInputSchema = z.object({
  focus: z.enum(["mission", "daily", "high", "matrix"]).optional(),
});
export const GenerateBriefingOutputSchema = z.object({
  briefing: z.string(),
  focus: z.string(),
});

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

type CommandHandler = (input: unknown, context: CommandExecutionContext) => Promise<unknown>;

interface RegisteredCommand {
  name: string;
  description: string;
  category: CommandCategory;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  requiresEnterprise: boolean;
  handler: (input: unknown, context: CommandExecutionContext) => Promise<unknown>;
}

const commandRegistry = new Map<string, RegisteredCommand>();

function registerCommand(cmd: RegisteredCommand): void {
  if (commandRegistry.has(cmd.name)) {
    throw new Error(`Command already registered: ${cmd.name}`);
  }
  commandRegistry.set(cmd.name, cmd);
}

// ============================================================================
// COMMAND HANDLERS (Server-side implementations)
// ============================================================================

async function handleGetMissionContext(
  _input: unknown,
  context: CommandExecutionContext,
) {
  return {
    mission: context.missionContext.mission,
    highTasks: context.missionContext.highTasks,
    mediumTasks: context.missionContext.mediumTasks,
    lowTasks: context.missionContext.lowTasks,
    dailyAction: context.missionContext.dailyAction,
    dailyDone: context.missionContext.dailyDone,
    streakCount: context.missionContext.streakCount,
  };
}

async function handleGetPriorities(
  _input: unknown,
  context: CommandExecutionContext,
) {
  const high = context.missionContext.highTasks.filter((t) => !t.done);
  const nextHighImpact = high.length > 0 ? high[0] : null;
  return {
    high: context.missionContext.highTasks,
    medium: context.missionContext.mediumTasks,
    low: context.missionContext.lowTasks,
    nextHighImpact,
  };
}

async function handleGetTaskDetails(
  input: unknown,
  context: CommandExecutionContext,
) {
  const parsed = GetTaskDetailsInputSchema.parse(input);
  const allTasks = [
    ...context.missionContext.highTasks,
    ...context.missionContext.mediumTasks,
    ...context.missionContext.lowTasks,
  ];
  const task = allTasks.find((t) => t.id === parsed.taskId);
  if (!task) return null;

  // Determine tier
  let tier: ImpactTier = "low";
  if (context.missionContext.highTasks.some((t) => t.id === parsed.taskId)) tier = "high";
  else if (context.missionContext.mediumTasks.some((t) => t.id === parsed.taskId)) tier = "medium";

  return { ...task, tier };
}

async function handleSummarizeProgress(
  _input: unknown,
  context: CommandExecutionContext,
) {
  const allTasks = [
    ...context.missionContext.highTasks,
    ...context.missionContext.mediumTasks,
    ...context.missionContext.lowTasks,
  ];
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.done).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const nextActions = allTasks
    .filter((t) => !t.done)
    .slice(0, 3)
    .map((t) => t.text);

  return {
    summary: `${completed} of ${total} tasks completed (${completionRate}%). ${context.missionContext.streakCount}-day streak.`,
    completionRate,
    streak: context.missionContext.streakCount,
    nextActions,
  };
}

async function handleGetDailyActionFocus(
  _input: unknown,
  context: CommandExecutionContext,
) {
  return {
    text: context.missionContext.dailyAction,
    done: context.missionContext.dailyDone,
    date: new Date().toISOString().split("T")[0],
  };
}

// Focus timer handlers - these would integrate with the existing timer infrastructure
async function handleStartFocusTimer(
  input: unknown,
  _context: CommandExecutionContext,
) {
  const parsed = StartFocusTimerInputSchema.parse(input);
  // In a real implementation, this would create a timer in the database
  // For now, return a simulated response
  const endTime = new Date(Date.now() + parsed.durationMinutes * 60 * 1000).toISOString();
  return {
    success: true,
    timerId: `timer-${Date.now()}`,
    endTime,
    durationMinutes: parsed.durationMinutes,
  };
}

async function handlePauseFocusTimer(
  _input: unknown,
  _context: CommandExecutionContext,
) {
  return { success: true, remainingSeconds: 0 };
}

async function handleResumeFocusTimer(
  _input: unknown,
  _context: CommandExecutionContext,
) {
  return { success: true, endTime: new Date(Date.now() + 25 * 60 * 1000).toISOString() };
}

async function handleStopFocusTimer(
  _input: unknown,
  _context: CommandExecutionContext,
) {
  return { success: true, elapsedMinutes: 0 };
}

async function handleProposeTaskCreate(
  input: unknown,
  _context: CommandExecutionContext,
) {
  const parsed = ProposeTaskCreateInputSchema.parse(input);
  const preview = {
    id: `proposed-${Date.now()}`,
    text: parsed.text,
    tier: parsed.tier,
    deadline: parsed.deadline ?? null,
  };
  return { proposed: true, taskPreview: preview, requiresApproval: true };
}

async function handleProposeTaskUpdate(
  input: unknown,
  _context: CommandExecutionContext,
) {
  const parsed = ProposeTaskUpdateInputSchema.parse(input);
  return { proposed: true, changes: parsed, requiresApproval: true };
}

async function handleProposeMissionUpdate(
  input: unknown,
  context: CommandExecutionContext,
) {
  const parsed = ProposeMissionUpdateInputSchema.parse(input);
  return {
    proposed: true,
    currentMission: context.missionContext.mission,
    proposedMission: parsed.mission,
    requiresApproval: true,
  };
}

async function handleGenerateBriefing(
  input: unknown,
  context: CommandExecutionContext,
) {
  const parsed = GenerateBriefingInputSchema.parse(input);
  const focus = parsed.focus ?? "mission";
  const briefing = `Strategic briefing for ${focus}: ${context.missionContext.mission || "No mission declared"}. ${context.missionContext.highTasks.filter((t) => !t.done).length} high-impact tasks pending.`;
  return { briefing, focus };
}

// ============================================================================
// REGISTER ALL COMMANDS
// ============================================================================

// Read-only commands
registerCommand({
  name: "get_mission_context",
  description: "Retrieve current mission, tasks, daily action, and streak",
  category: "read-only",
  inputSchema: GetMissionContextInputSchema,
  outputSchema: GetMissionContextOutputSchema,
  requiresEnterprise: false,
  handler: handleGetMissionContext,
});

registerCommand({
  name: "get_priorities",
  description: "Retrieve current high/medium/low priority tasks and next high-impact task",
  category: "read-only",
  inputSchema: GetPrioritiesInputSchema,
  outputSchema: GetPrioritiesOutputSchema,
  requiresEnterprise: false,
  handler: handleGetPriorities,
});

registerCommand({
  name: "get_task_details",
  description: "Retrieve authorized details for a specific task",
  category: "read-only",
  inputSchema: GetTaskDetailsInputSchema,
  outputSchema: GetTaskDetailsOutputSchema,
  requiresEnterprise: false,
  handler: handleGetTaskDetails,
});

registerCommand({
  name: "summarize_progress",
  description: "Summarize mission progress with completion rate and next actions",
  category: "read-only",
  inputSchema: SummarizeProgressInputSchema,
  outputSchema: SummarizeProgressOutputSchema,
  requiresEnterprise: false,
  handler: handleSummarizeProgress,
});

registerCommand({
  name: "get_daily_action_focus",
  description: "Retrieve the current Daily Action Focus",
  category: "read-only",
  inputSchema: GetDailyActionFocusInputSchema,
  outputSchema: GetDailyActionFocusOutputSchema,
  requiresEnterprise: false,
  handler: handleGetDailyActionFocus,
});

// Reversible local commands
registerCommand({
  name: "start_focus_timer",
  description: "Start a focus timer with optional task context",
  category: "reversible-local",
  inputSchema: StartFocusTimerInputSchema,
  outputSchema: StartFocusTimerOutputSchema,
  requiresEnterprise: false,
  handler: handleStartFocusTimer,
});

registerCommand({
  name: "pause_focus_timer",
  description: "Pause the active focus timer",
  category: "reversible-local",
  inputSchema: PauseFocusTimerInputSchema,
  outputSchema: PauseFocusTimerOutputSchema,
  requiresEnterprise: false,
  handler: handlePauseFocusTimer,
});

registerCommand({
  name: "resume_focus_timer",
  description: "Resume a paused focus timer",
  category: "reversible-local",
  inputSchema: ResumeFocusTimerInputSchema,
  outputSchema: ResumeFocusTimerOutputSchema,
  requiresEnterprise: false,
  handler: handleResumeFocusTimer,
});

registerCommand({
  name: "stop_focus_timer",
  description: "Stop the focus timer",
  category: "reversible-local",
  inputSchema: StopFocusTimerInputSchema,
  outputSchema: StopFocusTimerOutputSchema,
  requiresEnterprise: false,
  handler: handleStopFocusTimer,
});

// Persistent modification commands (require approval)
registerCommand({
  name: "propose_task_create",
  description: "Propose creating a new task (requires user approval)",
  category: "persistent-modification",
  inputSchema: ProposeTaskCreateInputSchema,
  outputSchema: ProposeTaskCreateOutputSchema,
  requiresEnterprise: false,
  handler: handleProposeTaskCreate,
});

registerCommand({
  name: "propose_task_update",
  description: "Propose updating a task (priority, deadline, completion) (requires user approval)",
  category: "persistent-modification",
  inputSchema: ProposeTaskUpdateInputSchema,
  outputSchema: ProposeTaskUpdateOutputSchema,
  requiresEnterprise: false,
  handler: handleProposeTaskUpdate,
});

registerCommand({
  name: "propose_mission_update",
  description: "Propose updating the core mission (requires user approval)",
  category: "persistent-modification",
  inputSchema: ProposeMissionUpdateInputSchema,
  outputSchema: ProposeMissionUpdateOutputSchema,
  requiresEnterprise: false,
  handler: handleProposeMissionUpdate,
});

registerCommand({
  name: "generate_briefing",
  description: "Generate a strategic briefing",
  category: "read-only",
  inputSchema: GenerateBriefingInputSchema,
  outputSchema: GenerateBriefingOutputSchema,
  requiresEnterprise: false,
  handler: handleGenerateBriefing,
});

// ============================================================================
// EXPORTS
// ============================================================================

export function getCommandRegistry(): ReadonlyMap<string, RegisteredCommand> {
  return commandRegistry;
}

export function getCommand(name: string): RegisteredCommand | undefined {
  return commandRegistry.get(name);
}

export function getCommandsByCategory(category: CommandCategory): RegisteredCommand[] {
  return Array.from(commandRegistry.values()).filter((cmd) => cmd.category === category);
}

export function getAvailableCommands(isEnterprise: boolean): RegisteredCommand[] {
  return Array.from(commandRegistry.values()).filter(
    (cmd) => !cmd.requiresEnterprise || isEnterprise,
  );
}

export function getFunctionDefinitions(isEnterprise: boolean) {
  return getAvailableCommands(isEnterprise).map((cmd) => ({
    type: "function" as const,
    name: cmd.name,
    description: cmd.description,
    parameters: cmd.inputSchema,
  }));
}

// Type exports (inferred from Zod schemas)
export type GetMissionContextInput = z.infer<typeof GetMissionContextInputSchema>;
export type GetMissionContextOutput = z.infer<typeof GetMissionContextOutputSchema>;
export type GetPrioritiesInput = z.infer<typeof GetPrioritiesInputSchema>;
export type GetPrioritiesOutput = z.infer<typeof GetPrioritiesOutputSchema>;
export type GetTaskDetailsInput = z.infer<typeof GetTaskDetailsInputSchema>;
export type GetTaskDetailsOutput = z.infer<typeof GetTaskDetailsOutputSchema>;
export type SummarizeProgressInput = z.infer<typeof SummarizeProgressInputSchema>;
export type SummarizeProgressOutput = z.infer<typeof SummarizeProgressOutputSchema>;
export type GetDailyActionFocusInput = z.infer<typeof GetDailyActionFocusInputSchema>;
export type GetDailyActionFocusOutput = z.infer<typeof GetDailyActionFocusOutputSchema>;
export type StartFocusTimerInput = z.infer<typeof StartFocusTimerInputSchema>;
export type StartFocusTimerOutput = z.infer<typeof StartFocusTimerOutputSchema>;
export type PauseFocusTimerInput = z.infer<typeof PauseFocusTimerInputSchema>;
export type PauseFocusTimerOutput = z.infer<typeof PauseFocusTimerOutputSchema>;
export type ResumeFocusTimerInput = z.infer<typeof ResumeFocusTimerInputSchema>;
export type ResumeFocusTimerOutput = z.infer<typeof ResumeFocusTimerOutputSchema>;
export type StopFocusTimerInput = z.infer<typeof StopFocusTimerInputSchema>;
export type StopFocusTimerOutput = z.infer<typeof StopFocusTimerOutputSchema>;
export type ProposeTaskCreateInput = z.infer<typeof ProposeTaskCreateInputSchema>;
export type ProposeTaskCreateOutput = z.infer<typeof ProposeTaskCreateOutputSchema>;
export type ProposeTaskUpdateInput = z.infer<typeof ProposeTaskUpdateInputSchema>;
export type ProposeTaskUpdateOutput = z.infer<typeof ProposeTaskUpdateOutputSchema>;
export type ProposeMissionUpdateInput = z.infer<typeof ProposeMissionUpdateInputSchema>;
export type ProposeMissionUpdateOutput = z.infer<typeof ProposeMissionUpdateOutputSchema>;
export type GenerateBriefingInput = z.infer<typeof GenerateBriefingInputSchema>;
export type GenerateBriefingOutput = z.infer<typeof GenerateBriefingOutputSchema>;