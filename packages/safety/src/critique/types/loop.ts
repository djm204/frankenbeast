import type { Score, SessionId, TaskId } from './common.js';
import type { CritiqueResult, EvaluationFinding, EvaluationInput } from './evaluation.js';
import type { EscalationRequest } from './contracts.js';

/** Configuration for the critique loop. */
export interface LoopConfig {
  /** Maximum number of iterations (1-5, default 3). */
  readonly maxIterations: number;
  /** Token budget limit for the entire loop. */
  readonly tokenBudget: number;
  /** Number of consecutive same-category failures before consensus failure (default 3). */
  readonly consensusThreshold: number;
  /** Session identifier for tracking. */
  readonly sessionId: SessionId;
  /** Task identifier being reviewed. */
  readonly taskId: TaskId;
}

/** A single iteration within the critique loop. */
export interface CritiqueIteration {
  /** Zero-based iteration index. */
  readonly index: number;
  /** The input that was evaluated in this iteration. */
  readonly input: EvaluationInput;
  /** The critique result for this iteration. */
  readonly result: CritiqueResult;
  /** Timestamp when the iteration completed. */
  readonly completedAt: string;
}

/** Actionable correction request sent back to the Actor. */
export interface CorrectionRequest {
  /** Summary of what needs to change. */
  readonly summary: string;
  /** Specific findings that must be addressed. */
  readonly findings: readonly EvaluationFinding[];
  /** Overall score of the failed critique. */
  readonly score: Score;
  /** How many iterations have been spent so far. */
  readonly iterationCount: number;
}

/** Result when the critique loop passes. */
export interface CritiqueLoopPass {
  readonly verdict: 'pass';
  readonly iterations: readonly CritiqueIteration[];
}

/** Result when the critique loop fails (correction needed). */
export interface CritiqueLoopFail {
  readonly verdict: 'fail';
  readonly iterations: readonly CritiqueIteration[];
  readonly correction: CorrectionRequest;
}

/** Result when a circuit breaker halts the loop. */
export interface CritiqueLoopHalted {
  readonly verdict: 'halted';
  readonly iterations: readonly CritiqueIteration[];
  readonly reason: string;
}

/** Result when the loop escalates to HITL. */
export interface CritiqueLoopEscalated {
  readonly verdict: 'escalated';
  readonly iterations: readonly CritiqueIteration[];
  readonly escalation: EscalationRequest;
}

/** Discriminated union of all possible loop outcomes. */
export type CritiqueLoopResult =
  | CritiqueLoopPass
  | CritiqueLoopFail
  | CritiqueLoopHalted
  | CritiqueLoopEscalated;

/** Mutable state tracked across loop iterations (internal use). */
export interface LoopState {
  iterationCount: number;
  iterations: CritiqueIteration[];
  failureHistory: ReadonlyMap<string, number>;
}

/** A circuit breaker that can halt or escalate the loop. */
export interface CircuitBreaker {
  readonly name: string;
  check(state: LoopState, config: LoopConfig): CircuitBreakerResult;
}

/** Result of a circuit breaker check. */
export type CircuitBreakerResult =
  | { readonly tripped: false }
  | { readonly tripped: true; readonly reason: string; readonly action: 'halt' | 'escalate' };
