export const VERSION = '0.1.0';

// Core types
export type {
  PulseResult,
  Flag,
  FlagSeverity,
  ReflectionResult,
  Improvement,
  TechDebtItem,
  Action,
  HeartbeatReport,
} from './core/types.js';
export {
  FlagSchema,
  FlagSeveritySchema,
  PulseResultSchema,
  ImprovementSchema,
  TechDebtItemSchema,
  ReflectionResultSchema,
  ActionSchema,
} from './core/types.js';

// Config
export type { HeartbeatConfig } from './core/config.js';
export { HeartbeatConfigSchema } from './core/config.js';

// Errors
export { HeartbeatError, ChecklistParseError, ReflectionError } from './core/errors.js';

// Module contracts
export type { IMemoryModule, EpisodicTrace, MemoryEntry, SemanticLesson } from './modules/memory.js';
export type { IObservabilityModule, Trace, TokenSpendSummary } from './modules/observability.js';
export type { IPlannerModule, SelfImprovementTask } from './modules/planner.js';
export type { ICritiqueModule, AuditResult } from './modules/critique.js';
export type { IHitlGateway, Alert } from './modules/hitl.js';

// Checklist
export { parseChecklist } from './checklist/parser.js';
export type { WatchlistItem, ReflectionEntry, UnknownSection, ChecklistParseResult } from './checklist/parser.js';
export { writeChecklist } from './checklist/writer.js';

// Checker
export { DeterministicChecker } from './checker/deterministic-checker.js';
export type { GitStatusResult, DeterministicCheckerDeps } from './checker/deterministic-checker.js';

// Reflection
export type { ILlmClient, Result } from './reflection/types.js';
export { ReflectionEngine } from './reflection/reflection-engine.js';
export { buildReflectionPrompt } from './reflection/prompt-builder.js';
export { parseReflectionResponse } from './reflection/response-parser.js';

// Reporter
export { buildMorningBrief } from './reporter/morning-brief-builder.js';
export { ActionDispatcher } from './reporter/action-dispatcher.js';

// Orchestrator
export { PulseOrchestrator } from './orchestrator/pulse-orchestrator.js';
export type { PulseOrchestratorDeps } from './orchestrator/pulse-orchestrator.js';
