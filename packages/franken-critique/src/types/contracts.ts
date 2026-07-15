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

/** Structured signal emitted when a new lesson conflicts with prior lesson guidance. */
export interface LessonContradiction {
  /** Stable identifier for the conflicting lesson when available, or a deterministic fallback. */
  readonly conflictingLessonId: string;
  readonly evaluatorName: string;
  /** Common normalized terms that made the pair comparable instead of unrelated. */
  readonly sharedTerms: readonly string[];
  /** Human-readable reason that PM/liveness tooling can surface directly. */
  readonly reason: string;
  readonly conflictingFailureDescription: string;
  readonly conflictingCorrectionApplied: string;
  /** Exact conflicting directive text used for the match when it differs from the summary. */
  readonly conflictingGuidance?: string;
}

/** Deterministic contradiction-detector result for a recorded lesson. */
export interface LessonContradictionReport {
  readonly status: 'clear' | 'contradiction_detected' | 'not_checked';
  /** Operator-facing interpretation of the detector outcome. */
  readonly guidance: string;
  /** Targeted command that verifies the detector contract itself. */
  readonly verificationCommand: string;
  readonly contradictions: readonly LessonContradiction[];
}

/** Structured workflow that tells PM/liveness tooling how to roll back a bad lesson safely. */
export interface LessonRollbackWorkflow {
  /** Stable workflow identifier for downstream PM/liveness tooling. */
  readonly workflowId: 'lesson-rollback-v1';
  /** Lesson states where rollback is valid. */
  readonly eligibleStates: readonly ('experimental' | 'promoted')[];
  /** Deterministic rollback actions in execution order. */
  readonly steps: readonly string[];
  /** Evidence required before a rollback can retire or quarantine a lesson. */
  readonly requiredEvidence: readonly string[];
  /** JSON object shape expected when an LLM or operator requests rollback. */
  readonly requestSchema: {
    readonly lessonId: 'string';
    readonly rollbackReason: 'string';
    readonly evidenceUrls: 'string[]';
    readonly replacementLesson: 'string-or-null';
    readonly verificationCommand: 'string';
  };
  /** Explicit failure guidance when the rollback request lacks enough evidence. */
  readonly insufficientEvidenceGuidance: string;
}

/** Lifecycle states for learned critique guidance. */
export type LessonLifecycleStatus =
  'candidate' | 'active' | 'quarantined' | 'retired' | 'superseded';

/** Evidence attached to lesson quarantine/rollback decisions. */
export interface LessonQuarantineEvidence {
  readonly kind:
    | 'operator-report'
    | 'failed-regression'
    | 'review-comment'
    | 'incident-link';
  /** Stable URL, issue/PR reference, or operator report handle proving the lesson is harmful/stale. */
  readonly reference: string;
  readonly note?: string;
}

/** PM/liveness review item created whenever a lesson is quarantined. */
export interface LessonQuarantineReviewItem {
  readonly id: string;
  readonly status: 'open';
  readonly lessonId: string;
  readonly createdAt: string;
  readonly reason: string;
  readonly evidence: readonly LessonQuarantineEvidence[];
  readonly recommendedAction: string;
}

/** Metadata proving why a lesson was removed from future prompt/application paths. */
export interface LessonQuarantineMetadata {
  readonly trigger:
    'explicit-user-correction' | 'repeated-failure-threshold' | 'manual-review';
  readonly reason: string;
  readonly quarantinedAt: string;
  readonly evidence: readonly LessonQuarantineEvidence[];
  readonly threshold?: number;
  /** Lifecycle status before quarantine; missing means legacy active. */
  readonly previousLifecycleStatus?: LessonLifecycleStatus;
  readonly reviewItem: LessonQuarantineReviewItem;
}

/** Evidence that a quarantined lesson was reviewed and may be applied again. */
export interface LessonUnquarantineMetadata {
  readonly reviewedAt: string;
  readonly reviewer: string;
  readonly evidenceUrl: string;
  readonly reason: string;
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

/** Candidate signal that a recovered failed test may deserve durable skill guidance. */
export interface FailedTestSkillCandidate {
  /** Stable detector identifier for PM/liveness tooling. */
  readonly detector: 'failed-test-to-skill-candidate';
  /** Whether the failed critique finding looks like a concrete test failure. */
  readonly candidate: true;
  /** Iteration where the failed-test signal was observed. */
  readonly sourceIteration: number;
  /** Evaluator/reviewer that emitted the failed-test signal. */
  readonly evaluatorName: string;
  /** Matching signals that caused the lesson to be flagged. */
  readonly matchedSignals: readonly string[];
  /** Original finding messages that should be reviewed before creating or updating a skill. */
  readonly sourceFindingMessages: readonly string[];
  /** Deterministic operator guidance for PM handoffs and worker retrospectives. */
  readonly operatorGuidance: string;
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

export type LessonCandidateCategory =
  | 'procedure'
  | 'preference'
  | 'environment-fact'
  | 'task-state'
  | 'discard';

/** Redaction applied before a learned lesson candidate can reach durable memory. */
export interface LessonPrivacyRedaction {
  readonly kind: 'secret' | 'personal-data' | 'customer-data' | 'task-state';
  readonly label: string;
  readonly replacement: string;
}

/** Privacy/classification decision applied before lesson persistence. */
export interface LessonPrivacyFilterDecision {
  readonly schemaVersion: 'lesson-privacy-filter-v1';
  readonly category: LessonCandidateCategory;
  readonly action: 'admit' | 'reject';
  readonly sensitive: boolean;
  readonly approvalRequired: boolean;
  readonly flags: readonly string[];
  readonly redactions: readonly LessonPrivacyRedaction[];
  readonly originalHash: string;
  readonly reason: string;
}

/** Cooldown metadata attached to a recorded lesson so PM/liveness tooling can prevent churn. */
export interface LessonCooldownMetadata {
  /** Stable key used to deduplicate equivalent lessons across task ids during the cooldown window. */
  readonly key: string;
  /** Cooldown window in milliseconds. */
  readonly windowMs: number;
  /** Timestamp when this lesson was admitted to memory. */
  readonly recordedAt: string;
  /** Equivalent lessons should be suppressed until this timestamp. */
  readonly suppressUntil: string;
  /** Operator-facing guidance for interpreting suppressed lessons. */
  readonly guidance: string;
}

/** Structured record of a lesson suppressed by the learning cooldown. */
export interface LessonCooldownSuppression {
  /** Stable key that matched an in-cooldown lesson. */
  readonly key: string;
  /** Task that attempted to record the duplicate lesson. */
  readonly taskId: TaskId;
  /** Evaluator that produced the duplicate lesson. */
  readonly evaluatorName: string;
  /** Timestamp when the duplicate was suppressed. */
  readonly suppressedAt: string;
  /** Timestamp after which this lesson key may be recorded again. */
  readonly suppressUntil: string;
  /** Milliseconds remaining in the cooldown at suppression time. */
  readonly remainingMs: number;
  /** Deterministic operator-facing reason for PM/liveness output. */
  readonly reason: string;
}

/** A recurring critical finding observed across more than one task. */
export interface CrossTaskBlockerPattern {
  /** Stable key that identifies equivalent blocker findings across tasks. */
  readonly key: string;
  /** Evaluator that emitted the repeated blocker finding. */
  readonly evaluatorName: string;
  /** Normalized blocker finding text used for cross-task equivalence. */
  readonly normalizedFinding: string;
  /** Distinct-task threshold required before the pattern is surfaced. */
  readonly threshold: number;
  /** Number of distinct tasks observed for this blocker pattern. */
  readonly occurrences: number;
  /** Distinct tasks that have observed this blocker, ordered by first observation. */
  readonly taskIds: readonly TaskId[];
  /** First time this blocker pattern was observed. */
  readonly firstSeenAt: string;
  /** Most recent time this blocker pattern was observed. */
  readonly lastSeenAt: string;
  /** Operator-facing guidance for PM/liveness handoffs. */
  readonly guidance: string;
}

/** Deterministic per-agent learning summary for worker retrospectives and PM handoffs. */
export type LearningBacklogPriority = 'high' | 'medium' | 'low';

/** A single LLM-friendly backlog item produced from newly observed learning signals. */
export interface LearningBacklogPrioritizationItem {
  /** Stable item identifier for PM/liveness consumers. */
  readonly id: string;
  /** Source signal that created this backlog item. */
  readonly source:
    'recorded-lesson' | 'cooldown-suppression' | 'blocker-pattern';
  /** Coarse priority bucket for operator routing. */
  readonly priority: LearningBacklogPriority;
  /** Numeric score used for deterministic sorting inside a priority bucket. */
  readonly score: number;
  readonly taskId?: TaskId;
  readonly evaluatorName?: string;
  /** Short operator-facing title. */
  readonly title: string;
  /** Why this item received its priority. */
  readonly rationale: string;
  /** Next action PM/liveness tooling should present. */
  readonly recommendedAction: string;
}

/** Structured PM/liveness report for sorting learning backlog follow-up. */
export interface LearningBacklogPrioritizationReport {
  readonly schemaVersion: 'learning-backlog-prioritization-report-v1';
  readonly generatedAt: string;
  readonly guidance: string;
  readonly items: readonly LearningBacklogPrioritizationItem[];
}

export interface AgentImprovementScorecard {
  /** Stable schema identifier for PM/liveness tooling. */
  readonly schemaVersion: 'agent-improvement-scorecard-v1';
  /** Agent or worker identifier supplied by the recorder caller. */
  readonly agentId: string;
  readonly taskId: TaskId;
  readonly evaluatorName: string;
  /** Timestamp when the scorecard was generated. */
  readonly generatedAt: string;
  /** First failing score for this evaluator in the recovered critique loop. */
  readonly initialScore: number;
  /** Final recovered overall score from the pass/warn iteration. */
  readonly finalScore: number;
  /** Rounded difference between finalScore and initialScore. */
  readonly scoreDelta: number;
  /** Failing iteration indexes for this evaluator that contributed feedback. */
  readonly failingIterations: readonly number[];
  /** Iteration that recovered to pass/warn. */
  readonly resolvedIteration: number;
  /** Finding counts across the agent's failing iterations for this evaluator. */
  readonly findingCounts: {
    readonly critical: number;
    readonly warning: number;
    readonly info: number;
    readonly total: number;
  };
  /** LLM-friendly bullets that can be copied into retrospectives without parsing prose. */
  readonly improvementSignals: readonly string[];
  /** Operator-facing guidance for interpreting the scorecard. */
  readonly guidance: string;
}

/** Summary returned by LessonRecorder.record for PM/liveness consumers. */
export interface LessonRecordingResult {
  readonly recorded: number;
  readonly suppressedByCooldown: readonly LessonCooldownSuppression[];
  /** Lesson candidates rejected by privacy/classification before persistence. */
  readonly rejectedByPrivacy: readonly LessonPrivacyFilterDecision[];
  /** Cross-task blocker patterns discovered while recording this critique result. */
  readonly minedBlockerPatterns: readonly CrossTaskBlockerPattern[];
  /** Prioritized PM/liveness follow-up generated from this record call's learning signals. */
  readonly learningBacklogPrioritizationReport: LearningBacklogPrioritizationReport;
}

/** A lesson learned from a successful critique cycle. */
export interface CritiqueLesson {
  readonly evaluatorName: string;
  readonly failureDescription: string;
  readonly correctionApplied: string;
  readonly taskId: TaskId;
  readonly timestamp: string;
  /** Lifecycle status used by memory/frontload consumers before injecting learned guidance. */
  readonly lifecycleStatus?: LessonLifecycleStatus;
  /** Present when a bad/stale lesson has been quarantined and must not be applied. */
  readonly quarantine?: LessonQuarantineMetadata;
  /** Present after a reviewed manual unquarantine restores the lesson to active status. */
  readonly unquarantine?: LessonUnquarantineMetadata;
  /** Present for lessons recorded by LessonRecorder; absent legacy lessons are unverified. */
  readonly testTraceability?: readonly LessonTestTraceabilityEntry[];
  /** Present for new lessons that must remain quarantined until independently verified. */
  readonly experimentSandbox?: LessonExperimentSandbox;
  /** Present for lessons recorded by LessonRecorder so PM/liveness tooling can detect drift. */
  readonly contradictionReport?: LessonContradictionReport;
  /** LLM-friendly workflow for rolling back an incorrect, stale, or harmful learned lesson. */
  readonly rollbackWorkflow?: LessonRollbackWorkflow;
  /** Structured reviewer feedback that produced the lesson and should be reusable in PM handoffs. */
  readonly reviewerFeedback?: ReviewerFeedbackLessonCapture;
  /** Present when a recovered failed test is a candidate for future skill creation/update. */
  readonly failedTestSkillCandidate?: FailedTestSkillCandidate;
  /** Structured template for extracting reusable lessons from post-PR review/merge evidence. */
  readonly postPrLessonExtractionTemplate?: PostPrLessonExtractionTemplate;
  /** Cooldown guard that prevents equivalent lessons from being re-recorded until suppressUntil. */
  readonly cooldown?: LessonCooldownMetadata;
  /** Cross-task blocker patterns associated with this lesson, if any crossed the threshold. */
  readonly blockerPatterns?: readonly CrossTaskBlockerPattern[];
  /** Optional per-agent learning scorecard for worker retrospectives and PM handoffs. */
  readonly agentImprovementScorecard?: AgentImprovementScorecard;
  /** Privacy and learning-classification decision applied before durable recording. */
  readonly privacyFilter?: LessonPrivacyFilterDecision;
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
  /** Optional adapter hook for comparable prior lessons used by contradiction detection. */
  searchLessons?(
    query: string,
    topK: number,
  ): Promise<readonly CritiqueLesson[]>;
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
