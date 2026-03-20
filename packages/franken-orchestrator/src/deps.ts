import type { CliSkillExecutor } from './skills/cli-skill-executor.js';
import type { PrCreator } from './closure/pr-creator.js';
import type { GraphBuilder } from './planning/chunk-file-graph-builder.js';

/**
 * BeastLoopDeps — dependency injection interface for the orchestrator.
 * All module ports are defined as minimal interfaces so the orchestrator
 * never depends on concrete module implementations.
 */

export interface ILogger {
  info(msg: string, dataOrSource?: unknown, source?: string): void;
  debug(msg: string, dataOrSource?: unknown, source?: string): void;
  warn(msg: string, dataOrSource?: unknown, source?: string): void;
  error(msg: string, dataOrSource?: unknown, source?: string): void;
}

/** What the orchestrator needs from MOD-01 (Firewall). */
export interface IFirewallModule {
  runPipeline(input: string): Promise<FirewallResult>;
}

export interface FirewallResult {
  readonly sanitizedText: string;
  readonly violations: readonly FirewallViolation[];
  readonly blocked: boolean;
}

export interface FirewallViolation {
  readonly rule: string;
  readonly severity: 'block' | 'warn';
  readonly detail: string;
}

/** What the orchestrator needs from MOD-02 (Skills). */
export interface ISkillsModule {
  hasSkill(skillId: string): boolean;
  getAvailableSkills(): readonly SkillDescriptor[];
  execute(skillId: string, input: SkillInput): Promise<SkillResult>;
}

export interface SkillDescriptor {
  readonly id: string;
  readonly name: string;
  readonly requiresHitl: boolean;
  readonly executionType: 'llm' | 'function' | 'mcp' | 'cli';
}

export interface SkillInput {
  readonly objective: string;
  readonly context: MemoryContext;
  readonly dependencyOutputs: ReadonlyMap<string, unknown>;
  readonly sessionId: string;
  readonly projectId: string;
}

export interface SkillResult {
  readonly output: unknown;
  readonly tokensUsed?: number | undefined;
}

/** What the orchestrator needs from MOD-03 (Brain/Memory). */
export interface IMemoryModule {
  frontload(projectId: string): Promise<void>;
  getContext(projectId: string): Promise<MemoryContext>;
  recordTrace(trace: EpisodicEntry): Promise<void>;
}

export interface MemoryContext {
  readonly adrs: readonly string[];
  readonly knownErrors: readonly string[];
  readonly rules: readonly string[];
}

export interface EpisodicEntry {
  readonly taskId: string;
  readonly summary: string;
  readonly outcome: 'success' | 'failure';
  readonly timestamp: string;
}

/** What the orchestrator needs from MOD-04 (Planner). */
export interface IPlannerModule {
  createPlan(intent: PlanIntent): Promise<PlanGraph>;
}

export interface PlanIntent {
  readonly goal: string;
  readonly strategy?: string | undefined;
  readonly context?: Record<string, unknown> | undefined;
}

export interface PlanGraph {
  readonly tasks: readonly PlanTask[];
}

export interface PlanTask {
  readonly id: string;
  readonly objective: string;
  readonly requiredSkills: readonly string[];
  readonly dependsOn: readonly string[];
}

/** What the orchestrator needs from MOD-05 (Observer). */
export interface IObserverModule {
  startTrace(sessionId: string): void;
  startSpan(name: string): SpanHandle;
  getTokenSpend(sessionId: string): Promise<TokenSpendData>;
}

export interface SpanHandle {
  end(metadata?: Record<string, unknown> | undefined): void;
}

export interface TokenSpendData {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
}

/** What the orchestrator needs from MOD-06 (Critique). */
export interface ICritiqueModule {
  reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult>;
}

export interface CritiqueResult {
  readonly verdict: 'pass' | 'fail';
  readonly findings: readonly CritiqueFinding[];
  readonly score: number;
}

export interface CritiqueFinding {
  readonly evaluator: string;
  readonly severity: string;
  readonly message: string;
}

/** What the orchestrator needs from MOD-07 (Governor). */
export interface IGovernorModule {
  requestApproval(request: ApprovalPayload): Promise<ApprovalOutcome>;
}

export interface ApprovalPayload {
  readonly taskId: string;
  readonly summary: string;
  readonly skillId?: string | undefined;
  readonly requiresHitl: boolean;
}

export interface ApprovalOutcome {
  readonly decision: 'approved' | 'rejected' | 'abort';
  readonly reason?: string | undefined;
}

/** What the orchestrator needs from MOD-08 (Heartbeat). */
export interface IHeartbeatModule {
  pulse(): Promise<HeartbeatPulseResult>;
}

export interface HeartbeatPulseResult {
  readonly improvements: readonly string[];
  readonly techDebt: readonly string[];
  readonly summary: string;
}

export interface IMcpModule {
  callTool(name: string, args: unknown): Promise<McpToolCallResult>;
  getAvailableTools(): readonly McpToolInfo[];
}

export interface McpToolCallResult {
  readonly content: unknown;
  readonly isError: boolean;
}

export interface McpToolInfo {
  readonly name: string;
  readonly serverId: string;
  readonly description: string;
}

/** Checkpoint persistence for crash recovery. */
export interface ICheckpointStore {
  has(key: string): boolean;
  write(key: string): void;
  readAll(): Set<string>;
  clear(): void;
  recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void;
  lastCommit(taskId: string, stage: string): string | undefined;
}

/** RunConfig-derived overrides for spawned agent processes. */
export interface RunConfigOverrides {
  /** Allowed skills filter — if set, only these skill IDs are available. */
  readonly allowedSkills?: readonly string[] | undefined;
}

/** Full dependency bag for the Beast Loop. */
export interface BeastLoopDeps {
  readonly firewall: IFirewallModule;
  readonly skills: ISkillsModule;
  readonly memory: IMemoryModule;
  readonly planner: IPlannerModule;
  readonly observer: IObserverModule;
  readonly critique: ICritiqueModule;
  readonly governor: IGovernorModule;
  readonly heartbeat: IHeartbeatModule;
  readonly logger: ILogger;
  readonly graphBuilder?: GraphBuilder;
  readonly prCreator?: PrCreator;
  readonly mcp?: IMcpModule;
  readonly cliExecutor?: CliSkillExecutor;
  readonly clock: () => Date;
  readonly checkpoint?: ICheckpointStore;
  readonly refreshPlanTasks?: () => Promise<readonly PlanTask[]>;
  readonly runConfigOverrides?: RunConfigOverrides;
}

type _TypesAndInterfacesTest = {
  readonly skillInput: SkillInput;
  readonly skillResult: SkillResult;
  readonly mcpModule: IMcpModule;
};
