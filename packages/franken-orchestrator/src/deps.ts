import type { CliSkillExecutor } from './skills/cli-skill-executor.js';
import type { PrCreator } from './closure/pr-creator.js';
import type { GraphBuilder } from './planning/chunk-file-graph-builder.js';
import type {
  ReasoningCritiqueFinding,
  ReasoningCritiqueResult,
  PlanningIntent,
  PlanningPlanGraph,
  PlanningPlanTask,
} from '@franken/types';

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
  /** False only for an explicit no-firewall adapter. */
  readonly enabled?: boolean;
  runPipeline(input: string): Promise<FirewallResult>;
  /** Scan untrusted response content, including response-target middleware. */
  scanResponse(input: string): Promise<FirewallResult>;
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
  readonly parentSkillId?: string | undefined;
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
  /** Plan objective when summary carries failure diagnostics instead. */
  readonly objective?: string | undefined;
  readonly outcome: 'success' | 'failure';
  readonly timestamp: string;
}

/** What the orchestrator needs from MOD-04 (Planner). */
export interface IPlannerModule {
  createPlan(intent: PlanIntent): Promise<PlanGraph>;
  /** Optional side-effect-free readiness probe for recording planner adapters. */
  checkHealth?(): Promise<void>;
}

export type PlanIntent = PlanningIntent;
export type PlanGraph = PlanningPlanGraph;
export type PlanTask = PlanningPlanTask;

/** What the orchestrator needs from MOD-05 (Observer). */
export interface IObserverModule {
  startTrace(sessionId: string): void;
  startSpan(name: string): SpanHandle;
  getTokenSpend(sessionId: string): Promise<TokenSpendData>;
  recordReplay?(record: {
    readonly kind: 'llm.request' | 'llm.response' | 'tool.call' | 'tool.result' | 'environment.snapshot';
    readonly runId: string;
    readonly provider?: string | undefined;
    readonly model?: string | undefined;
    readonly toolName?: string | undefined;
    readonly content: string;
  }): void;
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
  /** False for an explicit no-critique or unavailable-module stub. */
  readonly configured?: boolean;
  reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult>;
  /** Optional read-only startup probe. */
  checkHealth?(): Promise<void>;
}

/** A halt is terminal: replanning would issue more billable calls after budget exhaustion. */
export type CritiqueResult = ReasoningCritiqueResult;

export type CritiqueFinding = ReasoningCritiqueFinding;

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
  /** Scope-bound authorization artifact issued by the governor for an approval. */
  readonly token?: ApprovalSessionToken | undefined;
}

/** Minimal governor session-token contract exposed across the orchestrator port. */
export interface ApprovalSessionToken {
  readonly tokenId: string;
  readonly approvalId: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly grantedAt: Date;
  readonly expiresAt: Date;
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
  callTool(name: string, args: unknown, serverId?: string | undefined): Promise<McpToolCallResult>;
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
  readonly inputSchema?: Record<string, unknown> | undefined;
}

/** Checkpoint persistence for crash recovery. */
export interface CheckpointTaskOutput {
  readonly found: boolean;
  readonly output?: unknown;
  /** True when the primary output sidecar was unavailable and a previous known-good value was used. */
  readonly stale?: boolean | undefined;
  /** Operator-facing reason a stale dependency output had to be used. */
  readonly staleReason?: 'missing-primary' | 'corrupt-primary' | undefined;
}

export interface ICheckpointStore {
  readonly checkpointPath?: string | undefined;
  has(key: string): boolean;
  write(key: string): void;
  readAll(): Set<string>;
  clear(): void;
  writeTaskOutput?(taskId: string, output: unknown): void;
  readTaskOutput?(taskId: string): CheckpointTaskOutput;
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
