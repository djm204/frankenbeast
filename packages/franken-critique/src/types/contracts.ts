import type { SessionId, TaskId } from './common.js';
import type { TokenSpend } from '@franken/types';

export type { TokenSpend };

/** A safety rule from MOD-01 (Firewall/Guardrails). */
export interface SafetyRule {
  readonly id: string;
  readonly description: string;
  readonly pattern: string;
  readonly severity: 'block' | 'warn';
}

/** Result of a sandbox execution from MOD-01. */
export interface SandboxResult {
  readonly success: boolean;
  readonly output: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

/** A matching ADR document from MOD-03 (Brain/Memory). */
export interface ADRMatch {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly relevanceScore: number;
}

/** An episodic trace from MOD-03 (Brain/Memory). */
export interface EpisodicTrace {
  readonly taskId: TaskId;
  readonly summary: string;
  readonly outcome: 'success' | 'failure';
  readonly timestamp: string;
}

/** A traceable link from a learned critique lesson to the regression test expected to guard it. */
export interface LessonTestTraceabilityEntry {
  /** Stable identifier that PM handoffs can use to connect the lesson to its regression test. */
  readonly lessonId: string;
  readonly taskId: TaskId;
  readonly evaluatorName: string;
  readonly failingIteration: number;
  readonly resolvedIteration: number;
  readonly sourceFindingMessages: readonly string[];
  /** Deterministic regression-test identifier expected to cover this lesson before promotion. */
  readonly testId: string;
  /** Targeted command that verifies the traceability-map contract itself. */
  readonly verificationCommand: string;
}

/**
 * Safety metadata for newly learned critique lessons.
 *
 * New lessons are recorded as experimental so PM and liveness tooling can inspect them without
 * treating one recovered critique loop as enough evidence to promote or retire production guidance.
 */
export interface LessonExperimentSandbox {
  /** New lessons start in the experiment sandbox until a human or promotion job verifies them. */
  readonly state: 'experimental';
  /** Promotion is intentionally blocked while the lesson is still in the sandbox. */
  readonly promotionBlocked: true;
  /** Operator-facing reason explaining why this lesson is quarantined. */
  readonly reason: string;
  /** Deterministic criteria required before PM handoffs can promote or retire the lesson. */
  readonly exitCriteria: readonly string[];
  /** Targeted command that verifies the sandbox metadata contract itself. */
  readonly verificationCommand: string;
}

/** A lesson learned from a successful critique cycle. */
export interface CritiqueLesson {
  readonly evaluatorName: string;
  readonly failureDescription: string;
  readonly correctionApplied: string;
  readonly taskId: TaskId;
  readonly timestamp: string;
  /** Present for lessons recorded by LessonRecorder; absent legacy lessons are unverified. */
  readonly testTraceability?: readonly LessonTestTraceabilityEntry[];
  /** Present for new lessons that must remain quarantined until independently verified. */
  readonly experimentSandbox?: LessonExperimentSandbox;
}

/** Escalation request sent to MOD-07 (Governor). */
export interface EscalationRequest {
  readonly reason: string;
  readonly iterationCount: number;
  readonly lastCritiqueResults: readonly string[];
  readonly taskId: TaskId;
  readonly sessionId: SessionId;
}

// --- Port Interfaces (Hexagonal Architecture) ---

/** What MOD-06 needs from MOD-01 (Firewall/Guardrails). */
export interface GuardrailsPort {
  getSafetyRules(): Promise<readonly SafetyRule[]>;
  executeSandbox(code: string, timeout: number): Promise<SandboxResult>;
}

/** What MOD-06 needs from MOD-03 (Brain/Memory). */
export interface MemoryPort {
  searchADRs(query: string, topK: number): Promise<readonly ADRMatch[]>;
  searchEpisodic(taskId: TaskId): Promise<readonly EpisodicTrace[]>;
  recordLesson(lesson: CritiqueLesson): Promise<void>;
}

/** What MOD-06 needs from MOD-05 (Observer). */
export interface ObservabilityPort {
  getTokenSpend(sessionId: SessionId): Promise<TokenSpend>;
}

/** What MOD-06 emits to MOD-07 (Governor). */
export interface EscalationPort {
  requestHumanReview(request: EscalationRequest): Promise<void>;
}
