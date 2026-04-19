// Beast Loop orchestrator
export { BeastLoop } from './beast-loop.js';

// CLI
export type { CliArgs, Subcommand } from './cli/args.js';
export { parseArgs, printUsage } from './cli/args.js';
export type { ProjectPaths } from './cli/project-root.js';
export { resolveProjectRoot, getProjectPaths, generatePlanName, scaffoldFrankenbeast } from './cli/project-root.js';
export { detectCurrentBranch, resolveBaseBranch } from './cli/base-branch.js';

// Dependencies
export type { BeastLoopDeps } from './deps.js';
export type {
  ICheckpointStore,
  IFirewallModule,
  FirewallResult,
  FirewallViolation,
  ISkillsModule,
  SkillDescriptor,
  SkillInput,
  SkillResult,
  IMemoryModule,
  MemoryContext,
  EpisodicEntry,
  IPlannerModule,
  PlanIntent,
  PlanGraph,
  PlanTask,
  IObserverModule,
  SpanHandle,
  TokenSpendData,
  ICritiqueModule,
  CritiqueResult,
  CritiqueFinding,
  IGovernorModule,
  ApprovalPayload,
  ApprovalOutcome,
  IHeartbeatModule,
  HeartbeatPulseResult,
  ILogger,
} from './deps.js';

// Types
export type {
  BeastPhase,
  BeastResult,
  BeastInput,
  TaskOutcome,
} from './types.js';

// Config
export { OrchestratorConfigSchema, defaultConfig } from './config/orchestrator-config.js';
export type { OrchestratorConfig } from './config/orchestrator-config.js';

// Context
export { BeastContext } from './context/franken-context.js';
export type { AuditEntry } from './context/franken-context.js';
export { createContext } from './context/context-factory.js';

// Phases
export { runIngestion, InjectionDetectedError } from './phases/ingestion.js';
export { runHydration } from './phases/hydration.js';
export { runPlanning, CritiqueSpiralError } from './phases/planning.js';
export { runExecution, HitlRejectedError } from './phases/execution.js';
export { runClosure } from './phases/closure.js';
export { PrCreator } from './closure/pr-creator.js';

// Injection detection patterns
export { PATTERNS_ALL_TIERS, PATTERNS_STRICT_ONLY } from './middleware/index.js';
export type { InjectionTier } from './middleware/index.js';

// Circuit breakers
export { checkInjection } from './breakers/injection-breaker.js';
export { checkBudget, BudgetExceededError } from './breakers/budget-breaker.js';
export { checkCritiqueSpiral } from './breakers/critique-spiral-breaker.js';

// LLM helpers
export { AdapterLlmClient } from './adapters/adapter-llm-client.js';
export { LlmSkillHandler } from './skills/llm-skill-handler.js';
export { LlmPlanner } from './skills/llm-planner.js';

// Planning
export { ChunkFileGraphBuilder } from './planning/chunk-file-graph-builder.js';
export { LlmGraphBuilder } from './planning/llm-graph-builder.js';
export { InterviewLoop } from './planning/interview-loop.js';
export type { InterviewIO } from './planning/interview-loop.js';
export type { GraphBuilder } from './planning/chunk-file-graph-builder.js';

// CLI skill execution
export { CliSkillExecutor } from './skills/cli-skill-executor.js';
export { MartinLoop, parseResetTime } from './skills/martin-loop.js';
export { GitBranchIsolator } from './skills/git-branch-isolator.js';
export type {
  CliSkillConfig,
  GitIsolationConfig,
  MartinLoopConfig,
  MartinLoopResult,
  IterationResult,
} from './skills/cli-types.js';

// CLI providers
export type { ICliProvider, ProviderOpts } from './skills/providers/index.js';
export { ProviderRegistry, createDefaultRegistry } from './skills/providers/index.js';

// Checkpoint
export { FileCheckpointStore } from './checkpoint/file-checkpoint-store.js';

// Beasts
export type {
  BeastDefinition,
  BeastDispatchSource,
  BeastExecutionMode,
  BeastInterviewPrompt,
  BeastInterviewSession,
  BeastRun,
  BeastRunAttempt,
  BeastRunEvent,
  BeastRunStatus,
} from './beasts/types.js';
export { BEAST_SQLITE_SCHEMA_STATEMENTS } from './beasts/repository/sqlite-schema.js';
export { SQLiteBeastRepository } from './beasts/repository/sqlite-beast-repository.js';
export { BeastLogStore } from './beasts/events/beast-log-store.js';
export { BEAST_DEFINITIONS } from './beasts/definitions/catalog.js';
export { BeastCatalogService } from './beasts/services/beast-catalog-service.js';
export { BeastInterviewService } from './beasts/services/beast-interview-service.js';
export { AgentService } from './beasts/services/agent-service.js';
export { AgentInitService } from './beasts/services/agent-init-service.js';
export { BeastDispatchService } from './beasts/services/beast-dispatch-service.js';
export { BeastRunService } from './beasts/services/beast-run-service.js';
export type { BeastExecutor } from './beasts/execution/beast-executor.js';
export { ProcessSupervisor } from './beasts/execution/process-supervisor.js';
export { ProcessBeastExecutor } from './beasts/execution/process-beast-executor.js';
export { ContainerBeastExecutor } from './beasts/execution/container-beast-executor.js';
export type { BeastMetrics } from './beasts/telemetry/beast-metrics.js';
export { PrometheusBeastMetrics } from './beasts/telemetry/prometheus-beast-metrics.js';

// Logging
export {
  BeastLogger,
  stripAnsi,
  budgetBar,
  statusBadge,
  logHeader,
  BANNER,
  renderBanner,
  ANSI,
} from './logging/beast-logger.js';
export type { BeastLoggerOptions } from './logging/beast-logger.js';

// Resilience
export {
  serializeContext,
  deserializeContext,
  saveContext,
  loadContext,
} from './resilience/context-serializer.js';
export type { ContextSnapshot } from './resilience/context-serializer.js';
export { GracefulShutdown } from './resilience/graceful-shutdown.js';
export type { ShutdownHandler } from './resilience/graceful-shutdown.js';
export { checkModuleHealth, allHealthy } from './resilience/module-initializer.js';
export type { ModuleHealth } from './resilience/module-initializer.js';

// CLI — file writer
export { writeDesignDoc, readDesignDoc } from './cli/file-writer.js';

// CLI — session orchestrator
export { Session } from './cli/session.js';
export type { SessionPhase, SessionConfig } from './cli/session.js';
