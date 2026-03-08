// @franken/critique — MOD-06: Self-Critique & Reflection
// Public API barrel export

// Types — common
export type { Severity, Verdict, Score, SessionId, TaskId } from './types/common.js';

// Types — evaluation
export type {
  EvaluationInput,
  EvaluationFinding,
  EvaluationResult,
  CritiqueResult,
  Evaluator,
} from './types/evaluation.js';

// Types — contracts (port interfaces for sibling modules)
export type {
  SafetyRule,
  SandboxResult,
  ADRMatch,
  EpisodicTrace,
  CritiqueLesson,
  TokenSpend,
  EscalationRequest,
  GuardrailsPort,
  MemoryPort,
  ObservabilityPort,
  EscalationPort,
} from './types/contracts.js';

// Types — loop
export type {
  LoopConfig,
  CritiqueIteration,
  CorrectionRequest,
  CritiqueLoopResult,
  CritiqueLoopPass,
  CritiqueLoopFail,
  CritiqueLoopHalted,
  CritiqueLoopEscalated,
  LoopState,
  CircuitBreaker,
  CircuitBreakerResult,
} from './types/loop.js';

// Errors
export {
  CritiqueError,
  EvaluationError,
  CircuitBreakerError,
  EscalationError,
  IntegrationError,
  ConfigurationError,
} from './errors/index.js';
export type { CritiqueErrorOptions } from './errors/index.js';

// Core components
export { CritiquePipeline } from './pipeline/critique-pipeline.js';
export { CritiqueLoop } from './loop/critique-loop.js';
export { LessonRecorder } from './memory/lesson-recorder.js';

// Evaluators
export { SafetyEvaluator } from './evaluators/safety.js';
export { GhostDependencyEvaluator } from './evaluators/ghost-dependency.js';
export { LogicLoopEvaluator } from './evaluators/logic-loop.js';
export { FactualityEvaluator } from './evaluators/factuality.js';
export { ConcisenessEvaluator } from './evaluators/conciseness.js';
export { ComplexityEvaluator } from './evaluators/complexity.js';
export { ScalabilityEvaluator } from './evaluators/scalability.js';
export { ADRComplianceEvaluator } from './evaluators/adr-compliance.js';

// Circuit Breakers
export { MaxIterationBreaker } from './breakers/max-iteration.js';
export { TokenBudgetBreaker } from './breakers/token-budget.js';
export { ConsensusFailureBreaker } from './breakers/consensus-failure.js';

// Public API
export { createReviewer } from './reviewer.js';
export type { ReviewerConfig, Reviewer } from './reviewer.js';
