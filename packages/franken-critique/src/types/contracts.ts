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

/** A normalized reviewer finding captured alongside a learned critique lesson. */
export interface ReviewerFeedbackLessonEntry {
  /** Iteration where the reviewer feedback was emitted. */
  readonly sourceIteration: number;
  /** Evaluator/reviewer that emitted the feedback. */
  readonly evaluatorName: string;
  /** Original reviewer finding message. */
  readonly message: string;
  /** Severity assigned by the reviewer. */
  readonly severity: string;
  /** Optional source location supplied by the reviewer. */
  readonly location?: string;
  /** Optional reviewer suggestion captured for future workers. */
  readonly suggestion?: string;
}

/** Structured reviewer feedback attached to a learned critique lesson. */
export interface ReviewerFeedbackLessonCapture {
  /** Operator-facing summary of the feedback that produced the lesson. */
  readonly summary: string;
  /** Findings from the failed reviewer pass that should guide future workers. */
  readonly findings: readonly ReviewerFeedbackLessonEntry[];
  /** Whether every captured feedback item included an actionable suggestion. */
  readonly suggestionsComplete: boolean;
  /** Deterministic guidance for PM handoffs when suggestions are missing. */
  readonly missingSuggestionGuidance?: string;
}

/** LLM-friendly template PM/worker handoffs can use after a PR closes to extract reusable lessons. */
export interface PostPrLessonExtractionTemplate {
  /** Stable template identifier for downstream liveness tooling and prompt selection. */
  readonly templateId: 'post-pr-lesson-extraction-v1';
  /** Operator-facing moment when this template should be run. */
  readonly trigger: 'after-pr-review-or-merge';
  /** Prompt instructions for the LLM or worker producing the post-PR lesson. */
  readonly instructions: readonly string[];
  /** Evidence that must be present before a lesson can be promoted from this template. */
  readonly requiredEvidence: readonly string[];
  /** JSON object shape expected from the extraction step. */
  readonly outputSchema: {
    readonly issueNumber: 'number-or-null';
    readonly prUrl: 'string-or-null';
    readonly sourceFinding: 'string';
    readonly correctionApplied: 'string';
    readonly reusableLesson: 'string';
    readonly regressionEvidence: 'string';
    readonly followUpNeeded: 'boolean';
  };
  /** Explicit failure guidance when the PR lacks enough evidence to extract a lesson. */
  readonly insufficientEvidenceGuidance: string;
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
  /** Structured reviewer feedback that produced the lesson and should be reusable in PM handoffs. */
  readonly reviewerFeedback?: ReviewerFeedbackLessonCapture;
  /** Structured template for extracting reusable lessons from post-PR review/merge evidence. */
  readonly postPrLessonExtractionTemplate?: PostPrLessonExtractionTemplate;
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
