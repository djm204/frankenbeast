import type {
  MemoryPort,
  CritiqueLesson,
  LessonContradictionReport,
  LessonCooldownSuppression,
  LessonRecordingResult,
  ReviewerFeedbackLessonCapture,
  PostPrLessonExtractionTemplate,
  LessonRollbackWorkflow,
  CrossTaskBlockerPattern,
  LearningBacklogPrioritizationItem,
  AgentImprovementScorecard,
} from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { createHash } from 'node:crypto';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';
const LESSON_CONTRADICTION_VERIFICATION_COMMAND =
  LESSON_TRACEABILITY_VERIFICATION_COMMAND;

const DEFAULT_LESSON_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_LESSON_COOLDOWN_MS = 100 * 365 * 24 * 60 * 60 * 1000;
const PENDING_ADMISSIONS_BY_COOLDOWN_STORE = new WeakMap<
  Map<string, number>,
  Map<string, Promise<boolean>>
>();
const PENDING_BLOCKER_ADMISSIONS_BY_STORE = new WeakMap<
  Map<string, BlockerPatternState>,
  Map<string, Promise<void>>
>();

const LEARNING_COOLDOWN_GUIDANCE =
  'Equivalent critique lessons are suppressed during this cooldown window so PM/liveness tooling does not churn on repeated feedback before promotion or retirement review.';
const DEFAULT_BLOCKER_PATTERN_THRESHOLD = 3;
const MIN_BLOCKER_PATTERN_THRESHOLD = 2;
const BLOCKER_PATTERN_GUIDANCE =
  'Equivalent blocker findings have recurred across distinct tasks; PM/liveness handoffs should treat this as a cross-task pattern and route a durable mitigation instead of rediscovering it per task.';
const AGENT_IMPROVEMENT_SCORECARD_GUIDANCE =
  'Use this per-agent scorecard in worker retrospectives and PM handoff summaries to compare improvement over time without parsing free-form lesson prose.';
const LEARNING_BACKLOG_PRIORITIZATION_GUIDANCE =
  'Use this report to sort newly observed learning backlog items before promotion, retirement, or PM routing; higher priority items should receive durable mitigation before low-risk documentation follow-up.';

export interface BlockerPatternObservation {
  readonly taskId: TaskId;
  readonly observedAt: string;
}

export interface BlockerPatternState {
  readonly key: string;
  readonly evaluatorName: string;
  readonly normalizedFinding: string;
  readonly observations: BlockerPatternObservation[];
}

interface PendingBlockerPatternObservation {
  readonly key: string;
  readonly taskId: TaskId;
  readonly evaluatorName: string;
  readonly normalizedFinding: string;
  readonly observedAt: string;
}

export interface LessonRecorderOptions {
  /** Milliseconds to suppress equivalent lessons after one is admitted. Defaults to 24 hours. */
  readonly cooldownMs?: number;
  /** Clock injection for deterministic tests and replay tooling. */
  readonly now?: () => Date | string;
  /** Shared cooldown state for reviewer rebuilds that happen in the same process. */
  readonly cooldownStore?: Map<string, number>;
  /** Distinct task count required before a repeated critical finding is surfaced as a blocker pattern. Defaults to 3. */
  readonly blockerPatternThreshold?: number;
  /** Shared blocker-pattern state for mining recurrent blockers across recorder instances. */
  readonly blockerPatternStore?: Map<string, BlockerPatternState>;
  /** Optional per-agent identifier used to attach deterministic improvement scorecards to learned lessons. */
  readonly agentId?: string;
}

const LESSON_EXPERIMENT_SANDBOX_REASON =
  'New critique lessons are experimental until their traceability map and regression evidence are independently verified.';

const LESSON_ROLLBACK_INSUFFICIENT_EVIDENCE_GUIDANCE =
  'Do not roll back a lesson unless the rollback request names the lesson, explains the bad/stale guidance, links review or regression evidence, and includes a verification command for the replacement or retirement decision.';

const LESSON_ROLLBACK_WORKFLOW: LessonRollbackWorkflow = {
  workflowId: 'lesson-rollback-v1',
  eligibleStates: ['experimental', 'promoted'],
  steps: [
    'Quarantine the target lesson so PM/liveness tooling stops promoting it into new handoffs.',
    'Attach the rollback reason, evidence URLs, and verifier command to the lesson audit trail.',
    'Either record a replacement lesson with fresh traceability evidence or mark the original lesson retired with no replacement.',
    'Run the verifier command and include the result in the PM handoff before removing the rollback block.',
  ],
  requiredEvidence: [
    'Stable lesson identifier or traceability entry',
    'Reason the lesson is incorrect, stale, over-broad, or harmful',
    'Review comment, failed regression, operator report, or incident link proving rollback is warranted',
    'Verification command for the replacement lesson or retired state',
  ],
  requestSchema: {
    lessonId: 'string',
    rollbackReason: 'string',
    evidenceUrls: 'string[]',
    replacementLesson: 'string-or-null',
    verificationCommand: 'string',
  },
  insufficientEvidenceGuidance: LESSON_ROLLBACK_INSUFFICIENT_EVIDENCE_GUIDANCE,
};

const MISSING_REVIEWER_SUGGESTION_GUIDANCE =
  'Reviewer feedback did not include suggestions for every finding; PM handoffs should preserve the original message and ask a reviewer to attach remediation guidance before promotion.';

const POST_PR_LESSON_EXTRACTION_TEMPLATE: PostPrLessonExtractionTemplate = {
  templateId: 'post-pr-lesson-extraction-v1',
  trigger: 'after-pr-review-or-merge',
  instructions: [
    'Inspect the linked issue, PR description, final diff, reviewer feedback, and verification evidence before extracting a durable lesson.',
    'Extract only lessons that are reusable for future workers; do not restate one-off implementation details as policy.',
    'If required evidence is missing, set followUpNeeded to true and use insufficientEvidenceGuidance instead of inventing a lesson.',
  ],
  requiredEvidence: [
    'Linked issue or task identifier',
    'PR URL or merge/review artifact',
    'Reviewer finding or failure mode that motivated the correction',
    'Correction applied in the final PR head',
    'Regression test, verifier, or explicit reason no code-level regression applies',
  ],
  outputSchema: {
    issueNumber: 'number-or-null',
    prUrl: 'string-or-null',
    sourceFinding: 'string',
    correctionApplied: 'string',
    reusableLesson: 'string',
    regressionEvidence: 'string',
    followUpNeeded: 'boolean',
  },
  insufficientEvidenceGuidance:
    'Do not promote a post-PR lesson until the issue/PR, source finding, correction, and verification evidence are all available.',
};

export class LessonRecorder {
  private readonly memory: MemoryPort;
  private readonly cooldownMs: number;
  private readonly now: () => string;
  private readonly cooldowns: Map<string, number>;
  private readonly pendingAdmissions: Map<string, Promise<boolean>>;
  private readonly blockerPatternThreshold: number;
  private readonly blockerPatterns: Map<string, BlockerPatternState>;
  private readonly pendingBlockerAdmissions: Map<string, Promise<void>>;
  private readonly agentId?: string;
  private readonly pendingBlockerObservations = new WeakMap<
    CritiqueLesson,
    PendingBlockerPatternObservation[]
  >();

  constructor(memory: MemoryPort, options: LessonRecorderOptions = {}) {
    const cooldownMs = options.cooldownMs ?? DEFAULT_LESSON_COOLDOWN_MS;
    if (
      !Number.isFinite(cooldownMs) ||
      cooldownMs < 0 ||
      cooldownMs > MAX_LESSON_COOLDOWN_MS
    ) {
      throw new RangeError(
        'LessonRecorder cooldownMs must be a finite, non-negative number within the supported Date range.',
      );
    }

    this.memory = memory;
    this.cooldownMs = cooldownMs;
    const blockerPatternThreshold =
      options.blockerPatternThreshold ?? DEFAULT_BLOCKER_PATTERN_THRESHOLD;
    if (
      !Number.isInteger(blockerPatternThreshold) ||
      blockerPatternThreshold < MIN_BLOCKER_PATTERN_THRESHOLD
    ) {
      throw new RangeError(
        'LessonRecorder blockerPatternThreshold must be an integer greater than or equal to 2.',
      );
    }
    this.blockerPatternThreshold = blockerPatternThreshold;
    this.blockerPatterns = options.blockerPatternStore ?? new Map();
    this.pendingBlockerAdmissions = getPendingBlockerAdmissions(
      this.blockerPatterns,
    );
    if (options.agentId !== undefined) {
      const agentId = options.agentId.trim();
      if (!agentId) {
        throw new RangeError(
          'LessonRecorder agentId must be a non-empty string when provided.',
        );
      }
      this.agentId = agentId;
    }
    const now = options.now ?? ((): Date => new Date());
    this.now = (): string => normalizeTimestamp(now());
    this.cooldowns = options.cooldownStore ?? new Map<string, number>();
    this.pendingAdmissions = options.cooldownStore
      ? getPendingAdmissions(options.cooldownStore)
      : new Map<string, Promise<boolean>>();
  }

  async record(
    result: CritiqueLoopResult,
    taskId: TaskId,
  ): Promise<LessonRecordingResult> {
    const recordingResult = createMutableLessonRecordingResult(this.now());

    // Only record lessons from multi-iteration pass/warn successes.
    if (
      (result.verdict !== 'pass' && result.verdict !== 'warn') ||
      result.iterations.length <= 1
    ) {
      return recordingResult;
    }

    const failingIterations = result.iterations.filter(
      (it) => it.result.verdict === 'fail',
    );

    for (const iteration of failingIterations) {
      const lessons = this.extractLessons(iteration, result.iterations, taskId);
      for (const extractedLesson of lessons) {
        await this.recordExtractedLesson(extractedLesson, recordingResult);
      }
    }

    return recordingResult;
  }

  private async recordExtractedLesson(
    extractedLesson: CritiqueLesson,
    recordingResult: MutableLessonRecordingResult,
  ): Promise<void> {
    await this.withBlockerPatternAdmissionLock(extractedLesson, async () => {
      let lesson = this.withCurrentBlockerPatterns(extractedLesson);
      const cooldownKey =
        this.cooldownMs > 0 ? lesson.cooldown?.key : undefined;
      let admissionSettled: ((admitted: boolean) => void) | undefined;
      let admissionPromise: Promise<boolean> | undefined;
      if (cooldownKey) {
        let admittedByAnotherCall = false;
        while (!admittedByAnotherCall) {
          const pendingAdmission = this.pendingAdmissions.get(cooldownKey);
          if (pendingAdmission) {
            await pendingAdmission;
            continue;
          }

          if (this.cooldownMs > 0) {
            admissionPromise = new Promise<boolean>((resolve) => {
              admissionSettled = resolve;
            });
            this.pendingAdmissions.set(cooldownKey, admissionPromise);
          }

          lesson = this.withCurrentBlockerPatterns(lesson);
          const hasMinedBlockerPatterns =
            (lesson.blockerPatterns?.length ?? 0) > 0;
          const suppression = this.getCooldownSuppression(lesson, cooldownKey);
          if (suppression && !hasMinedBlockerPatterns) {
            this.commitBlockerPatternObservations(lesson);
            recordingResult.suppressedByCooldown.push(suppression);
            recordingResult.learningBacklogItems.push(
              createCooldownSuppressionBacklogItem(suppression),
            );
            admissionSettled?.(false);
            if (
              admissionPromise &&
              this.pendingAdmissions.get(cooldownKey) === admissionPromise
            ) {
              this.pendingAdmissions.delete(cooldownKey);
            }
            admittedByAnotherCall = true;
            break;
          }

          break;
        }

        if (admittedByAnotherCall) {
          return;
        }
      }

      try {
        const contradictionReport =
          await this.createContradictionReport(lesson);
        const admittedLesson = this.withAdmissionTimestamp({
          ...lesson,
          contradictionReport,
        });
        await this.memory.recordLesson(admittedLesson);
        recordingResult.recorded += 1;
        this.commitBlockerPatternObservations(lesson);
        addUniqueBlockerPatterns(
          recordingResult.minedBlockerPatterns,
          lesson.blockerPatterns,
        );
        addLessonBacklogItems(
          recordingResult.learningBacklogItems,
          admittedLesson,
        );
        if (cooldownKey && this.cooldownMs > 0) {
          this.cooldowns.set(
            cooldownKey,
            Date.parse(admittedLesson.cooldown!.suppressUntil),
          );
        }
        admissionSettled?.(true);
      } catch {
        admissionSettled?.(false);
        // Non-fatal: log failure but don't disrupt the critique flow
      } finally {
        if (
          cooldownKey &&
          admissionPromise &&
          this.pendingAdmissions.get(cooldownKey) === admissionPromise
        ) {
          this.pendingAdmissions.delete(cooldownKey);
        }
      }
    });
  }

  private async createContradictionReport(
    lesson: CritiqueLesson,
  ): Promise<LessonContradictionReport> {
    if (!this.memory.searchLessons) {
      return detectLessonContradictions(lesson);
    }

    try {
      const priorLessons = await this.memory.searchLessons(
        createLessonSearchQuery(lesson),
        10,
      );
      return detectLessonContradictions(lesson, priorLessons);
    } catch {
      return createLessonSearchFailureReport();
    }
  }

  private extractLessons(
    failingIteration: CritiqueIteration,
    allIterations: readonly CritiqueIteration[],
    taskId: TaskId,
  ): CritiqueLesson[] {
    const lessons: CritiqueLesson[] = [];
    const passingIteration = allIterations.find(
      (it) => it.result.verdict === 'pass' || it.result.verdict === 'warn',
    );

    for (const evalResult of failingIteration.result.results) {
      const critiqueFindings = evalResult.findings.filter(
        (finding) => finding.location !== EVALUATOR_EXCEPTION_LOCATION,
      );

      if (evalResult.verdict === 'fail' && critiqueFindings.length > 0) {
        const resolvedIteration =
          passingIteration?.index ?? failingIteration.index;
        const lessonId = createLessonId(
          taskId,
          evalResult.evaluatorName,
          failingIteration.index,
        );
        const findingMessages = critiqueFindings.map((f) => f.message);
        const recordedAt = this.now();
        const cooldownBaseMs = Date.parse(recordedAt);
        this.pruneExpiredCooldowns(cooldownBaseMs);
        const cooldownKey = createCooldownKey(
          evalResult.evaluatorName,
          findingMessages,
        );
        const suppressUntil = new Date(
          addCooldownWindowMs(cooldownBaseMs, this.cooldownMs),
        ).toISOString();
        const blockerPatternUpdate = this.previewBlockerPatterns(
          taskId,
          evalResult.evaluatorName,
          critiqueFindings,
          recordedAt,
        );

        const lesson: CritiqueLesson = {
          evaluatorName: evalResult.evaluatorName,
          failureDescription: findingMessages.join('; '),
          correctionApplied: passingIteration
            ? `Corrected in iteration ${passingIteration.index}`
            : 'Unknown correction',
          taskId,
          timestamp: recordedAt,
          experimentSandbox: {
            state: 'experimental',
            promotionBlocked: true,
            reason: LESSON_EXPERIMENT_SANDBOX_REASON,
            exitCriteria: [
              'Confirm at least one lesson-to-test traceability entry is present.',
              'Check the contradiction report and resolve any conflicting prior lesson before promotion.',
              'Run the listed verification command and attach the evidence to the PM handoff.',
              'Promote or retire the lesson only after review confirms the regression covers the source finding.',
            ],
            verificationCommand: LESSON_TRACEABILITY_VERIFICATION_COMMAND,
          },
          rollbackWorkflow: createLessonRollbackWorkflow(),
          testTraceability: [
            {
              lessonId,
              taskId,
              evaluatorName: evalResult.evaluatorName,
              failingIteration: failingIteration.index,
              resolvedIteration,
              sourceFindingMessages: findingMessages,
              testId: `${lessonId}:regression`,
              verificationCommand: LESSON_TRACEABILITY_VERIFICATION_COMMAND,
            },
          ],
          reviewerFeedback: createReviewerFeedbackCapture(
            failingIteration.index,
            evalResult.evaluatorName,
            critiqueFindings,
          ),
          postPrLessonExtractionTemplate:
            createPostPrLessonExtractionTemplate(),
          ...(this.agentId
            ? {
                agentImprovementScorecard: createAgentImprovementScorecard(
                  this.agentId,
                  taskId,
                  evalResult.evaluatorName,
                  failingIteration,
                  allIterations,
                  critiqueFindings,
                  recordedAt,
                ),
              }
            : {}),
          cooldown: {
            key: cooldownKey,
            windowMs: this.cooldownMs,
            recordedAt,
            suppressUntil,
            guidance: LEARNING_COOLDOWN_GUIDANCE,
          },
          ...(blockerPatternUpdate.patterns.length > 0
            ? { blockerPatterns: blockerPatternUpdate.patterns }
            : {}),
        };
        this.pendingBlockerObservations.set(
          lesson,
          blockerPatternUpdate.observations,
        );
        lessons.push(lesson);
      }
    }

    return lessons;
  }

  private previewBlockerPatterns(
    taskId: TaskId,
    evaluatorName: string,
    findings: readonly {
      readonly message: string;
      readonly severity: string;
    }[],
    observedAt: string,
  ): {
    patterns: CrossTaskBlockerPattern[];
    observations: PendingBlockerPatternObservation[];
  } {
    const minedPatterns: CrossTaskBlockerPattern[] = [];
    const pendingObservations: PendingBlockerPatternObservation[] = [];
    for (const finding of findings) {
      if (finding.severity !== 'critical') {
        continue;
      }

      const normalizedFinding = normalizeBlockerFinding(finding.message);
      if (!normalizedFinding) {
        continue;
      }

      const key = createBlockerPatternKey(evaluatorName, normalizedFinding);
      const pattern = this.blockerPatterns.get(key);
      const observations = pattern?.observations ?? [];

      if (observations.some((observation) => observation.taskId === taskId)) {
        continue;
      }

      if (pendingObservations.some((observation) => observation.key === key)) {
        continue;
      }

      const previousObservationCount = observations.length;
      const previewState: BlockerPatternState = {
        key,
        evaluatorName,
        normalizedFinding,
        observations: [...observations, { taskId, observedAt }],
      };
      pendingObservations.push({
        key,
        taskId,
        evaluatorName,
        normalizedFinding,
        observedAt,
      });
      if (
        previousObservationCount < this.blockerPatternThreshold &&
        previewState.observations.length >= this.blockerPatternThreshold
      ) {
        minedPatterns.push(
          createCrossTaskBlockerPattern(
            previewState,
            this.blockerPatternThreshold,
          ),
        );
      }
    }

    return { patterns: minedPatterns, observations: pendingObservations };
  }

  private commitBlockerPatternObservations(lesson: CritiqueLesson): void {
    const pendingObservations =
      this.pendingBlockerObservations.get(lesson) ?? [];
    for (const observation of pendingObservations) {
      let pattern = this.blockerPatterns.get(observation.key);
      if (!pattern) {
        pattern = {
          key: observation.key,
          evaluatorName: observation.evaluatorName,
          normalizedFinding: observation.normalizedFinding,
          observations: [],
        };
        this.blockerPatterns.set(observation.key, pattern);
      }
      if (
        !pattern.observations.some(
          (entry) => entry.taskId === observation.taskId,
        )
      ) {
        pattern.observations.push({
          taskId: observation.taskId,
          observedAt: observation.observedAt,
        });
      }
    }
    this.pendingBlockerObservations.delete(lesson);
  }

  private async withBlockerPatternAdmissionLock<T>(
    lesson: CritiqueLesson,
    operation: () => Promise<T>,
  ): Promise<T> {
    const keys = this.getPendingBlockerPatternKeys(lesson);
    if (keys.length === 0) {
      return operation();
    }

    while (true) {
      const pendingLocks = keys
        .map((key) => this.pendingBlockerAdmissions.get(key))
        .filter((lock): lock is Promise<void> => lock !== undefined);
      if (pendingLocks.length === 0) {
        break;
      }
      await Promise.allSettled(pendingLocks);
    }

    let releaseLock!: () => void;
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    for (const key of keys) {
      this.pendingBlockerAdmissions.set(key, lock);
    }

    try {
      return await operation();
    } finally {
      for (const key of keys) {
        if (this.pendingBlockerAdmissions.get(key) === lock) {
          this.pendingBlockerAdmissions.delete(key);
        }
      }
      releaseLock();
    }
  }

  private getPendingBlockerPatternKeys(lesson: CritiqueLesson): string[] {
    return Array.from(
      new Set(
        (this.pendingBlockerObservations.get(lesson) ?? []).map(
          (observation) => observation.key,
        ),
      ),
    ).sort();
  }

  private withCurrentBlockerPatterns(lesson: CritiqueLesson): CritiqueLesson {
    const pendingObservations =
      this.pendingBlockerObservations.get(lesson) ?? [];
    const patterns: CrossTaskBlockerPattern[] = [];
    const seenKeys = new Set<string>();
    for (const observation of pendingObservations) {
      if (seenKeys.has(observation.key)) {
        continue;
      }
      seenKeys.add(observation.key);
      const committedPattern = this.blockerPatterns.get(observation.key);
      const committedObservations = committedPattern?.observations ?? [];
      if (
        committedObservations.some(
          (entry) => entry.taskId === observation.taskId,
        )
      ) {
        continue;
      }

      const previewState: BlockerPatternState = {
        key: observation.key,
        evaluatorName: observation.evaluatorName,
        normalizedFinding: observation.normalizedFinding,
        observations: [
          ...committedObservations,
          { taskId: observation.taskId, observedAt: observation.observedAt },
        ],
      };
      if (
        committedObservations.length < this.blockerPatternThreshold &&
        previewState.observations.length >= this.blockerPatternThreshold
      ) {
        patterns.push(
          createCrossTaskBlockerPattern(
            previewState,
            this.blockerPatternThreshold,
          ),
        );
      }
    }

    if (patterns.length === 0) {
      if (!lesson.blockerPatterns) {
        return lesson;
      }
      const { blockerPatterns, ...lessonWithoutPatterns } = lesson;
      void blockerPatterns;
      this.pendingBlockerObservations.set(
        lessonWithoutPatterns,
        pendingObservations,
      );
      this.pendingBlockerObservations.delete(lesson);
      return lessonWithoutPatterns;
    }

    const lessonWithPatterns = { ...lesson, blockerPatterns: patterns };
    this.pendingBlockerObservations.set(
      lessonWithPatterns,
      pendingObservations,
    );
    this.pendingBlockerObservations.delete(lesson);
    return lessonWithPatterns;
  }

  private getCooldownSuppression(
    lesson: CritiqueLesson,
    cooldownKey: string,
  ): LessonCooldownSuppression | null {
    const suppressUntilMs = this.cooldowns.get(cooldownKey);
    if (!suppressUntilMs) {
      return null;
    }

    const suppressedAt = this.now();
    const suppressedAtMs = Date.parse(suppressedAt);
    const remainingMs = suppressUntilMs - suppressedAtMs;
    if (remainingMs <= 0) {
      this.cooldowns.delete(cooldownKey);
      return null;
    }

    return {
      key: cooldownKey,
      taskId: lesson.taskId,
      evaluatorName: lesson.evaluatorName,
      suppressedAt,
      suppressUntil: new Date(suppressUntilMs).toISOString(),
      remainingMs,
      reason:
        'Equivalent critique lesson is still inside the learning cooldown window; reuse the existing lesson metadata instead of recording another copy.',
    };
  }

  private pruneExpiredCooldowns(nowMs: number): void {
    for (const [key, suppressUntilMs] of this.cooldowns) {
      if (suppressUntilMs <= nowMs) {
        this.cooldowns.delete(key);
      }
    }
  }

  private withAdmissionTimestamp(lesson: CritiqueLesson): CritiqueLesson {
    if (!lesson.cooldown) {
      return lesson;
    }

    const recordedAt = this.now();
    const suppressUntil = new Date(
      addCooldownWindowMs(Date.parse(recordedAt), lesson.cooldown.windowMs),
    ).toISOString();

    return {
      ...lesson,
      timestamp: recordedAt,
      ...(lesson.agentImprovementScorecard
        ? {
            agentImprovementScorecard: {
              ...lesson.agentImprovementScorecard,
              generatedAt: recordedAt,
            },
          }
        : {}),
      cooldown: {
        ...lesson.cooldown,
        recordedAt,
        suppressUntil,
      },
    };
  }
}

export function detectLessonContradictions(
  lesson: CritiqueLesson,
  priorLessons?: readonly CritiqueLesson[],
): LessonContradictionReport {
  if (!priorLessons) {
    return {
      status: 'not_checked',
      guidance:
        'No lesson search adapter is available, so historical lesson contradictions were not checked.',
      verificationCommand: LESSON_CONTRADICTION_VERIFICATION_COMMAND,
      contradictions: [],
    };
  }

  const comparablePriorLessons = priorLessons.filter(
    (prior) => prior !== lesson,
  );

  const contradictions = comparablePriorLessons.flatMap((prior) => {
    const contradictionMatch = findContradictoryGuidanceMatch(lesson, prior);

    if (!sameEvaluator(lesson, prior) || contradictionMatch === undefined) {
      return [];
    }

    return [
      {
        conflictingLessonId: getLessonId(prior),
        evaluatorName: prior.evaluatorName,
        sharedTerms: contradictionMatch.sharedTerms,
        reason:
          'A prior lesson from the same evaluator discusses the same normalized terms but reverses negated guidance; review before promotion.',
        conflictingFailureDescription: prior.failureDescription,
        conflictingCorrectionApplied: prior.correctionApplied,
        conflictingGuidance: contradictionMatch.conflictingGuidance,
      },
    ];
  });

  if (contradictions.length > 0) {
    return {
      status: 'contradiction_detected',
      guidance:
        'Promotion is blocked until PM/liveness review reconciles the contradictory lesson guidance.',
      verificationCommand: LESSON_CONTRADICTION_VERIFICATION_COMMAND,
      contradictions,
    };
  }

  return {
    status: 'clear',
    guidance:
      'No deterministic lesson contradiction was detected among comparable prior lessons.',
    verificationCommand: LESSON_CONTRADICTION_VERIFICATION_COMMAND,
    contradictions: [],
  };
}

function createLessonSearchFailureReport(): LessonContradictionReport {
  return {
    status: 'not_checked',
    guidance:
      'Lesson search adapter failed, so historical lesson contradictions could not be checked; treat this as an adapter outage rather than a missing hook.',
    verificationCommand: LESSON_CONTRADICTION_VERIFICATION_COMMAND,
    contradictions: [],
  };
}

function getPendingAdmissions(
  cooldownStore: Map<string, number>,
): Map<string, Promise<boolean>> {
  let pending = PENDING_ADMISSIONS_BY_COOLDOWN_STORE.get(cooldownStore);
  if (!pending) {
    pending = new Map<string, Promise<boolean>>();
    PENDING_ADMISSIONS_BY_COOLDOWN_STORE.set(cooldownStore, pending);
  }
  return pending;
}

function getPendingBlockerAdmissions(
  blockerPatternStore: Map<string, BlockerPatternState>,
): Map<string, Promise<void>> {
  let pending = PENDING_BLOCKER_ADMISSIONS_BY_STORE.get(blockerPatternStore);
  if (!pending) {
    pending = new Map<string, Promise<void>>();
    PENDING_BLOCKER_ADMISSIONS_BY_STORE.set(blockerPatternStore, pending);
  }
  return pending;
}

interface MutableLessonRecordingResult extends LessonRecordingResult {
  recorded: number;
  suppressedByCooldown: LessonCooldownSuppression[];
  minedBlockerPatterns: CrossTaskBlockerPattern[];
  learningBacklogItems: LearningBacklogPrioritizationItem[];
}

function createMutableLessonRecordingResult(
  generatedAt: string,
): MutableLessonRecordingResult {
  const learningBacklogItems: LearningBacklogPrioritizationItem[] = [];
  const result = {
    recorded: 0,
    suppressedByCooldown: [],
    minedBlockerPatterns: [],
  } as unknown as MutableLessonRecordingResult;
  Object.defineProperty(result, 'learningBacklogItems', {
    value: learningBacklogItems,
    enumerable: false,
    writable: false,
  });
  Object.defineProperty(result, 'learningBacklogPrioritizationReport', {
    value: {
      schemaVersion: 'learning-backlog-prioritization-report-v1',
      generatedAt,
      guidance: LEARNING_BACKLOG_PRIORITIZATION_GUIDANCE,
      items: learningBacklogItems,
    },
    enumerable: true,
    writable: false,
  });
  return result;
}

function addUniqueBlockerPatterns(
  target: CrossTaskBlockerPattern[],
  patterns: readonly CrossTaskBlockerPattern[] | undefined,
): void {
  for (const pattern of patterns ?? []) {
    if (!target.some((existing) => existing.key === pattern.key)) {
      target.push(pattern);
    }
  }
}

function addLessonBacklogItems(
  target: LearningBacklogPrioritizationItem[],
  lesson: CritiqueLesson,
): void {
  target.push(createRecordedLessonBacklogItem(lesson));
  for (const pattern of lesson.blockerPatterns ?? []) {
    target.push(createBlockerPatternBacklogItem(pattern));
  }
  sortLearningBacklogItems(target);
}

function createRecordedLessonBacklogItem(
  lesson: CritiqueLesson,
): LearningBacklogPrioritizationItem {
  const hasCriticalFindings =
    (lesson.agentImprovementScorecard?.findingCounts.critical ?? 0) > 0 ||
    (lesson.blockerPatterns?.length ?? 0) > 0 ||
    lesson.reviewerFeedback?.findings.some(
      (finding) => finding.severity === 'critical',
    ) === true;
  const suggestionsIncomplete =
    lesson.reviewerFeedback?.suggestionsComplete === false;
  const priority = hasCriticalFindings
    ? 'high'
    : suggestionsIncomplete
      ? 'medium'
      : 'low';
  const score = priority === 'high' ? 80 : priority === 'medium' ? 50 : 30;
  const title = lesson.reviewerFeedback?.summary ?? lesson.failureDescription;
  const traceabilityId = lesson.testTraceability?.[0]?.lessonId;

  return {
    id: `lesson:${traceabilityId ?? stableHash(`${lesson.taskId}:${lesson.evaluatorName}:${lesson.failureDescription}`)}`,
    source: 'recorded-lesson',
    priority,
    score,
    taskId: lesson.taskId,
    evaluatorName: lesson.evaluatorName,
    title,
    rationale: hasCriticalFindings
      ? 'Recorded lesson contains critical findings and should be reviewed before routine learning cleanup.'
      : suggestionsIncomplete
        ? 'Recorded lesson is missing reviewer suggestions and needs PM follow-up before promotion.'
        : 'Recorded lesson is ready for routine learning backlog review once verification evidence is attached.',
    recommendedAction:
      'Route this lesson through promotion review with its traceability verifier before adding it to durable guidance.',
  };
}

function createCooldownSuppressionBacklogItem(
  suppression: LessonCooldownSuppression,
): LearningBacklogPrioritizationItem {
  return {
    id: `suppression:${suppression.key}:${sanitizeLessonIdPart(suppression.taskId)}`,
    source: 'cooldown-suppression',
    priority: 'low',
    score: 20,
    taskId: suppression.taskId,
    evaluatorName: suppression.evaluatorName,
    title: `Duplicate learning signal suppressed for ${suppression.evaluatorName}`,
    rationale:
      'Equivalent learning feedback is already inside the cooldown window and should not create duplicate backlog churn.',
    recommendedAction:
      'Reuse the existing in-cooldown lesson until suppression expires; do not create a duplicate backlog item.',
  };
}

function createBlockerPatternBacklogItem(
  pattern: CrossTaskBlockerPattern,
): LearningBacklogPrioritizationItem {
  return {
    id: `blocker:${pattern.key}`,
    source: 'blocker-pattern',
    priority: 'high',
    score: 100,
    evaluatorName: pattern.evaluatorName,
    title: pattern.normalizedFinding,
    rationale: `Critical learning blocker recurred across ${pattern.occurrences} distinct tasks and crossed the routing threshold of ${pattern.threshold}.`,
    recommendedAction:
      'Route a durable mitigation owner before accepting more duplicate worker rediscovery for this blocker pattern.',
  };
}

function sortLearningBacklogItems(
  items: LearningBacklogPrioritizationItem[],
): void {
  items.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.id.localeCompare(right.id);
  });
}

function createCrossTaskBlockerPattern(
  state: BlockerPatternState,
  threshold: number,
): CrossTaskBlockerPattern {
  return {
    key: state.key,
    evaluatorName: state.evaluatorName,
    normalizedFinding: state.normalizedFinding,
    threshold,
    occurrences: state.observations.length,
    taskIds: state.observations.map((observation) => observation.taskId),
    firstSeenAt: state.observations[0]!.observedAt,
    lastSeenAt: state.observations[state.observations.length - 1]!.observedAt,
    guidance: BLOCKER_PATTERN_GUIDANCE,
  };
}

function createBlockerPatternKey(
  evaluatorName: string,
  normalizedFinding: string,
): string {
  const normalizedPattern = JSON.stringify({
    evaluatorName,
    normalizedFinding,
  });
  return [
    'blocker-pattern',
    sanitizeLessonIdPart(evaluatorName),
    stableHash(normalizedPattern),
  ].join(':');
}

function normalizeBlockerFinding(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createAgentImprovementScorecard(
  agentId: string,
  taskId: TaskId,
  evaluatorName: string,
  failingIteration: CritiqueIteration,
  allIterations: readonly CritiqueIteration[],
  currentFindings: readonly {
    readonly message: string;
    readonly severity: string;
  }[],
  generatedAt: string,
): AgentImprovementScorecard {
  const evaluatorFailures = allIterations.filter((iteration) =>
    iteration.result.results.some(
      (result) =>
        result.evaluatorName === evaluatorName &&
        result.verdict === 'fail' &&
        result.findings.some(
          (finding) => finding.location !== EVALUATOR_EXCEPTION_LOCATION,
        ),
    ),
  );
  const failingIterations = evaluatorFailures.map(
    (iteration) => iteration.index,
  );
  const allFindings = evaluatorFailures.flatMap((iteration) =>
    iteration.result.results
      .filter(
        (result) =>
          result.evaluatorName === evaluatorName && result.verdict === 'fail',
      )
      .flatMap((result) =>
        result.findings.filter(
          (finding) => finding.location !== EVALUATOR_EXCEPTION_LOCATION,
        ),
      ),
  );
  const findings = allFindings.length > 0 ? allFindings : currentFindings;
  const initialScore =
    evaluatorFailures[0]?.result.results.find(
      (result) => result.evaluatorName === evaluatorName,
    )?.score ??
    failingIteration.result.results.find(
      (result) => result.evaluatorName === evaluatorName,
    )?.score ??
    failingIteration.result.overallScore;
  const passingIteration = allIterations.find(
    (iteration) =>
      iteration.result.verdict === 'pass' ||
      iteration.result.verdict === 'warn',
  );
  const finalScore =
    passingIteration?.result.results.find(
      (result) => result.evaluatorName === evaluatorName,
    )?.score ??
    passingIteration?.result.overallScore ??
    initialScore;
  const findingCounts = countScorecardFindings(findings);
  const scoreDelta = roundScore(finalScore - initialScore);
  const improvementSignals = [
    `Recovered from ${failingIterations.length} failing critique ${
      failingIterations.length === 1 ? 'iteration' : 'iterations'
    } before ${passingIteration?.result.verdict ?? 'recovery'}.`,
    `Improved ${evaluatorName} score by ${scoreDelta}.`,
    ...(findingCounts.critical > 0
      ? [
          `Resolved ${findingCounts.critical} critical blocker ${
            findingCounts.critical === 1 ? 'finding' : 'findings'
          }.`,
        ]
      : []),
  ];

  return {
    schemaVersion: 'agent-improvement-scorecard-v1',
    agentId,
    taskId,
    evaluatorName,
    generatedAt,
    initialScore: roundScore(initialScore),
    finalScore: roundScore(finalScore),
    scoreDelta,
    failingIterations,
    resolvedIteration: passingIteration?.index ?? failingIteration.index,
    findingCounts,
    improvementSignals,
    guidance: AGENT_IMPROVEMENT_SCORECARD_GUIDANCE,
  };
}

function countScorecardFindings(
  findings: readonly { readonly severity: string }[],
): AgentImprovementScorecard['findingCounts'] {
  const counts = { critical: 0, warning: 0, info: 0, total: findings.length };
  for (const finding of findings) {
    if (finding.severity === 'critical') {
      counts.critical += 1;
    } else if (finding.severity === 'warning') {
      counts.warning += 1;
    } else {
      counts.info += 1;
    }
  }
  return counts;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createPostPrLessonExtractionTemplate(): PostPrLessonExtractionTemplate {
  return {
    ...POST_PR_LESSON_EXTRACTION_TEMPLATE,
    instructions: [...POST_PR_LESSON_EXTRACTION_TEMPLATE.instructions],
    requiredEvidence: [...POST_PR_LESSON_EXTRACTION_TEMPLATE.requiredEvidence],
    outputSchema: { ...POST_PR_LESSON_EXTRACTION_TEMPLATE.outputSchema },
  };
}

function createLessonRollbackWorkflow(): LessonRollbackWorkflow {
  return {
    ...LESSON_ROLLBACK_WORKFLOW,
    eligibleStates: [...LESSON_ROLLBACK_WORKFLOW.eligibleStates],
    steps: [...LESSON_ROLLBACK_WORKFLOW.steps],
    requiredEvidence: [...LESSON_ROLLBACK_WORKFLOW.requiredEvidence],
    requestSchema: { ...LESSON_ROLLBACK_WORKFLOW.requestSchema },
  };
}

function createReviewerFeedbackCapture(
  sourceIteration: number,
  evaluatorName: string,
  findings: readonly {
    readonly message: string;
    readonly severity: string;
    readonly location?: string | undefined;
    readonly suggestion?: string | undefined;
  }[],
): ReviewerFeedbackLessonCapture {
  const capturedFindings = findings.map((finding) => ({
    sourceIteration,
    evaluatorName,
    message: finding.message,
    severity: finding.severity,
    ...(finding.location ? { location: finding.location } : {}),
    ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
  }));
  const suggestionsComplete = capturedFindings.every((finding) =>
    Boolean(finding.suggestion),
  );

  return {
    summary: capturedFindings.map((finding) => finding.message).join('; '),
    findings: capturedFindings,
    suggestionsComplete,
    ...(suggestionsComplete
      ? {}
      : { missingSuggestionGuidance: MISSING_REVIEWER_SUGGESTION_GUIDANCE }),
  };
}

function createLessonId(
  taskId: TaskId,
  evaluatorName: string,
  iterationIndex: number,
): string {
  return [taskId, evaluatorName, `iteration-${iterationIndex}`]
    .map((part) => sanitizeLessonIdPart(part))
    .join(':');
}

function createCooldownKey(
  evaluatorName: string,
  findingMessages: readonly string[],
): string {
  const normalizedFindings = JSON.stringify({
    evaluatorName,
    findings: findingMessages.map((message) => message.trim()).sort(),
  });
  return [
    'critique-lesson',
    sanitizeLessonIdPart(evaluatorName),
    stableHash(normalizedFindings),
  ].join(':');
}

function normalizeTimestamp(value: Date | string): string {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new RangeError('LessonRecorder clock returned an invalid timestamp.');
  }
  return new Date(parsed).toISOString();
}

function addCooldownWindowMs(baseMs: number, cooldownMs: number): number {
  const suppressUntilMs = baseMs + cooldownMs;
  if (!Number.isFinite(suppressUntilMs)) {
    throw new RangeError(
      'LessonRecorder cooldownMs produced an invalid suppressUntil timestamp.',
    );
  }
  return suppressUntilMs;
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function sanitizeLessonIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'unknown';
}

function createLessonSearchQuery(lesson: CritiqueLesson): string {
  return `${lesson.evaluatorName} ${createLessonGuidanceText(lesson)}`;
}

function sameEvaluator(a: CritiqueLesson, b: CritiqueLesson): boolean {
  return normalizeText(a.evaluatorName) === normalizeText(b.evaluatorName);
}

function findContradictoryGuidanceMatch(
  lesson: CritiqueLesson,
  prior: CritiqueLesson,
):
  | {
      sharedTerms: string[];
      lessonGuidance: string;
      conflictingGuidance: string;
    }
  | undefined {
  for (const lessonDirective of createLessonDirectiveClauses(lesson)) {
    for (const priorDirective of createLessonDirectiveClauses(prior)) {
      if (lessonDirective.polarity === priorDirective.polarity) {
        continue;
      }
      if (normalizeText(lessonDirective.sourceText) === normalizeText(priorDirective.sourceText)) {
        continue;
      }
      const opposedGuardSharedTerms = opposedConditionalGuardSharedTerms(
        lessonDirective,
        priorDirective,
      );
      if (opposedGuardSharedTerms.length >= MIN_CONTRADICTION_SHARED_TERMS) {
        return {
          sharedTerms: opposedGuardSharedTerms,
          lessonGuidance: lessonDirective.sourceText,
          conflictingGuidance: priorDirective.sourceText,
        };
      }
      if (hasCompatibleConditionalGuard(lessonDirective, priorDirective)) {
        continue;
      }
      const sharedTerms = sharedTextTerms(
        lessonDirective.text,
        priorDirective.text,
      );
      if (
        sharedTerms.length >= 1 &&
        hasExplicitOppositeDirectivePair(lessonDirective, priorDirective)
      ) {
        return {
          sharedTerms,
          lessonGuidance: lessonDirective.sourceText,
          conflictingGuidance: priorDirective.sourceText,
        };
      }
      if (sharedTerms.length >= MIN_CONTRADICTION_SHARED_TERMS) {
        return {
          sharedTerms,
          lessonGuidance: lessonDirective.sourceText,
          conflictingGuidance: priorDirective.sourceText,
        };
      }
    }
  }
  return undefined;
}

function sharedTextTerms(a: string, b: string): string[] {
  const aTerms = new Set(extractComparableTerms(a));
  const bTerms = new Set(extractComparableTerms(b));
  return [...aTerms].filter((term) => bTerms.has(term)).sort();
}

function createLessonGuidanceText(lesson: CritiqueLesson): string {
  return [lesson.failureDescription, createLessonDirectiveText(lesson)].join(
    ' ',
  );
}

function createLessonDirectiveText(lesson: CritiqueLesson): string {
  return createLessonDirectiveFragments(lesson).join(' ');
}

function createLessonDirectiveFragments(lesson: CritiqueLesson): string[] {
  const reviewerGuidance =
    lesson.reviewerFeedback?.findings.flatMap((finding) => [
      finding.suggestion ?? '',
    ]) ?? [];
  return [lesson.correctionApplied, ...reviewerGuidance].filter(
    (fragment) => normalizeText(fragment).length > 0,
  );
}

type LessonDirectivePolarity = 'positive' | 'negative';

interface LessonDirectiveClause {
  readonly text: string;
  readonly sourceText: string;
  readonly polarity: LessonDirectivePolarity;
  readonly guardCondition?: string;
  readonly conditionalProhibition?: boolean;
  readonly embeddedNegatedCondition?: string;
}

function createLessonDirectiveClauses(
  lesson: CritiqueLesson,
): LessonDirectiveClause[] {
  return createLessonDirectiveFragments(lesson).flatMap((fragment) =>
    createDirectiveClauses(fragment),
  );
}

function createDirectiveClauses(fragment: string): LessonDirectiveClause[] {
  const directiveFragments = splitDirectiveFragments(fragment);
  if (directiveFragments.length > 1) {
    return directiveFragments.flatMap((directiveFragment) =>
      createDirectiveClauses(directiveFragment),
    );
  }

  const normalized = normalizeText(fragment);
  if (normalized.length === 0) {
    return [];
  }

  const guardCondition = extractGuardCondition(fragment);
  const leadingPolarity = leadingDirectivePolarity(normalized);
  const conditionalProhibition =
    leadingPolarity === 'negative' && guardCondition !== undefined;
  const embeddedNegatedCondition = extractEmbeddedNegatedCondition(normalized);
  const clauses: LessonDirectiveClause[] = [
    {
      text: normalized,
      sourceText: fragment,
      polarity: leadingPolarity,
      ...(guardCondition ? { guardCondition } : {}),
      ...(conditionalProhibition ? { conditionalProhibition } : {}),
      ...(embeddedNegatedCondition ? { embeddedNegatedCondition } : {}),
    },
  ];

  if (guardCondition) {
    clauses.push({
      text: `${normalized} ${guardCondition}`,
      sourceText: fragment,
      polarity: 'negative',
      guardCondition,
      ...(conditionalProhibition ? { conditionalProhibition } : {}),
    });
  }

  if (embeddedNegatedCondition && leadingPolarity === 'positive') {
    clauses.push({
      text: embeddedNegatedCondition,
      sourceText: fragment,
      polarity: 'negative',
      embeddedNegatedCondition,
    });
  }

  return clauses;
}

function splitDirectiveFragments(fragment: string): string[] {
  return fragment
    .split(/[.;\n\r]+/)
    .map((part) => part.trim())
    .filter((part) => normalizeText(part).length > 0);
}

function extractGuardCondition(fragment: string): string | undefined {
  const match = /\b(?:without|unless|before)\s+([^.;,\n\r]+)/i.exec(fragment);
  const condition = match?.[1] ? normalizeText(match[1]) : '';
  return condition.length > 0 ? condition : undefined;
}

function extractEmbeddedNegatedCondition(
  normalized: string,
): string | undefined {
  const match = /\b(?:do not|don t|does not|not|never|cannot|can t|must not|should not)\s+(.+)$/i.exec(normalized);
  const condition = match?.[1]?.trim() ?? '';
  return condition.length > 0 ? condition : undefined;
}

function opposedConditionalGuardSharedTerms(
  a: LessonDirectiveClause,
  b: LessonDirectiveClause,
): string[] {
  const sharedTerms = sharedTextTerms(a.text, b.text);
  if (sharedTerms.length < MIN_CONTRADICTION_SHARED_TERMS) {
    return [];
  }

  if (
    a.conditionalProhibition &&
    a.guardCondition &&
    hasOpposedGuardOutcome(a.guardCondition, b.text)
  ) {
    return sharedTerms;
  }

  if (
    b.conditionalProhibition &&
    b.guardCondition &&
    hasOpposedGuardOutcome(b.guardCondition, a.text)
  ) {
    return sharedTerms;
  }

  return [];
}

function hasCompatibleConditionalGuard(
  a: LessonDirectiveClause,
  b: LessonDirectiveClause,
): boolean {
  return (
    hasCompatibleConditionalGuardPair(a, b) ||
    hasCompatibleConditionalGuardPair(b, a) ||
    hasCompatibleEmbeddedNegationPair(a, b) ||
    hasCompatibleEmbeddedNegationPair(b, a) ||
    hasCompatibleQualifiedExclusionPair(a, b) ||
    hasCompatibleQualifiedExclusionPair(b, a)
  );
}

function hasCompatibleConditionalGuardPair(
  maybeProhibition: LessonDirectiveClause,
  maybeRequirement: LessonDirectiveClause,
): boolean {
  const guardedRequirementAllowed =
    maybeRequirement.guardCondition === undefined ||
    /^(require|requires|required|verify|verifies|verified|validate|validates|validated)\b/.test(
      maybeRequirement.text,
    );

  if (
    maybeProhibition.polarity !== 'negative' ||
    maybeRequirement.polarity !== 'positive' ||
    !maybeProhibition.conditionalProhibition ||
    !maybeProhibition.guardCondition ||
    !guardedRequirementAllowed
  ) {
    return false;
  }

  if (!describesRequiredPrerequisite(maybeRequirement.text)) {
    return false;
  }

  if (
    hasOpposedGuardOutcome(
      maybeProhibition.guardCondition,
      maybeRequirement.text,
    )
  ) {
    return false;
  }

  return (
    sharedTextTerms(maybeProhibition.guardCondition, maybeRequirement.text)
      .length >= MIN_CONTRADICTION_SHARED_TERMS ||
    hasSingleTermGuardMatch(maybeProhibition, maybeRequirement)
  );
}

function hasSingleTermGuardMatch(
  maybeProhibition: LessonDirectiveClause,
  maybeRequirement: LessonDirectiveClause,
): boolean {
  if (!maybeProhibition.guardCondition) {
    return false;
  }

  return (
    sharedTextTerms(maybeProhibition.guardCondition, maybeRequirement.text)
      .length >= 1 &&
    sharedTextTerms(maybeProhibition.text, maybeRequirement.text).length >=
      MIN_CONTRADICTION_SHARED_TERMS
  );
}

function hasCompatibleEmbeddedNegationPair(
  maybeAllowedNegation: LessonDirectiveClause,
  maybeProhibition: LessonDirectiveClause,
): boolean {
  if (
    maybeAllowedNegation.polarity !== 'positive' ||
    maybeProhibition.polarity !== 'negative' ||
    !maybeAllowedNegation.embeddedNegatedCondition
  ) {
    return false;
  }

  return (
    sharedTextTerms(
      maybeAllowedNegation.embeddedNegatedCondition,
      maybeProhibition.text,
    ).length >= MIN_CONTRADICTION_SHARED_TERMS
  );
}

function hasCompatibleQualifiedExclusionPair(
  maybeAllowance: LessonDirectiveClause,
  maybeProhibition: LessonDirectiveClause,
): boolean {
  if (
    maybeAllowance.polarity !== 'positive' ||
    maybeProhibition.polarity !== 'negative'
  ) {
    return false;
  }

  const allowanceTerms = extractComparableTerms(maybeAllowance.text);
  const prohibitedTerms = new Set(
    extractComparableTerms(maybeProhibition.text),
  );
  return allowanceTerms.some((term) => {
    if (!term.startsWith('non_')) {
      return false;
    }
    return prohibitedTerms.has(term.slice('non_'.length));
  });
}

function hasOpposedGuardOutcome(
  guardCondition: string,
  requirementText: string,
): boolean {
  const guardHasPass =
    /\b(pass|passes|passed|passing|success|succeed|succeeds|valid|validated)\b/.test(
      guardCondition,
    );
  const guardHasFail = /\b(fail|fails|failed|failing|failure|invalid)\b/.test(
    guardCondition,
  );
  const requirementHasPass =
    /\b(pass|passes|passed|passing|success|succeed|succeeds|valid|validated)\b/.test(
      requirementText,
    );
  const requirementHasFail =
    /\b(fail|fails|failed|failing|failure|invalid)\b/.test(requirementText);

  return (
    (guardHasPass && requirementHasFail) || (guardHasFail && requirementHasPass)
  );
}

function describesRequiredPrerequisite(text: string): boolean {
  return /\b(require|requires|required|verify|verifies|verified|verification|validate|validates|validated|validation|when|after|before|present|provenance)\b/.test(
    text,
  );
}

function leadingDirectivePolarity(normalized: string): LessonDirectivePolarity {
  if (
    /^(no|never|avoid|reject|forbid|disallow|prohibit|disable|disabled)\b/.test(
      normalized,
    ) ||
    /^(do not|don t|must not|should not|cannot|can t)\b/.test(normalized)
  ) {
    return 'negative';
  }
  return 'positive';
}

function hasExplicitOppositeDirectivePair(
  a: LessonDirectiveClause,
  b: LessonDirectiveClause,
): boolean {
  return (
    hasExplicitOppositeDirectivePairInOrder(a, b) ||
    hasExplicitOppositeDirectivePairInOrder(b, a)
  );
}

function hasExplicitOppositeDirectivePairInOrder(
  maybeNegative: LessonDirectiveClause,
  maybePositive: LessonDirectiveClause,
): boolean {
  if (
    maybeNegative.polarity !== 'negative' ||
    maybePositive.polarity !== 'positive' ||
    !startsWithNegativeDirective(maybeNegative.text) ||
    !startsWithPositiveDirective(maybePositive.text)
  ) {
    return false;
  }

  const negativeObject = stripLeadingNegativeDirective(maybeNegative.text);
  if (negativeObject === maybePositive.text) {
    return true;
  }

  const positiveObject = stripLeadingPositiveDirective(maybePositive.text);
  return (
    negativeObject.length > 0 &&
    positiveObject.length > 0 &&
    negativeObject === positiveObject
  );
}

function startsWithNegativeDirective(normalized: string): boolean {
  return /^(no|never|avoid|reject|forbid|disallow|prohibit|disable|disabled|do not|don t|must not|should not|cannot|can t)\b/.test(
    normalized,
  );
}

function startsWithPositiveDirective(normalized: string): boolean {
  return /^(allow|enable|enabled|deploy|reuse|use|cache|log|record|permit)\b/.test(
    normalized,
  );
}

function stripLeadingNegativeDirective(normalized: string): string {
  return normalized
    .replace(
      /^(?:no|never|avoid|reject|forbid|disallow|prohibit|disable|disabled|do not|don t|must not|should not|cannot|can t)\s+/,
      '',
    )
    .trim();
}

function stripLeadingPositiveDirective(normalized: string): string {
  return normalized
    .replace(/^(?:allow|enable|enabled|reuse|use|cache|log|record|permit)\s+/, '')
    .trim();
}

function extractComparableTerms(value: string): string[] {
  const normalizedTerms = normalizeText(value).split(' ').filter(Boolean);
  const comparableTerms: string[] = [];

  for (let index = 0; index < normalizedTerms.length; index += 1) {
    const term = normalizedTerms[index]!;
    const nextTerm = normalizedTerms[index + 1];
    if (term === 'non' && nextTerm && isComparableTerm(nextTerm)) {
      comparableTerms.push(`non_${nextTerm}`);
      index += 1;
      continue;
    }

    if (isComparableTerm(term)) {
      comparableTerms.push(term);
    }
  }

  return comparableTerms;
}

function isComparableTerm(term: string): boolean {
  return (
    (term.length >= 4 || LESSON_CONTRADICTION_SHORT_TERMS.has(term)) &&
    !LESSON_CONTRADICTION_STOP_WORDS.has(term)
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getLessonId(lesson: CritiqueLesson): string {
  return (
    lesson.testTraceability?.[0]?.lessonId ??
    `legacy-lesson-${stableHash(
      `${lesson.evaluatorName}\n${lesson.failureDescription}\n${lesson.correctionApplied}\n${createLessonDirectiveText(lesson)}`,
    ).slice(0, 16)}`
  );
}

const MIN_CONTRADICTION_SHARED_TERMS = 2;

const LESSON_CONTRADICTION_SHORT_TERMS = new Set([
  'api',
  'cli',
  'env',
  'id',
  'jwt',
  'log',
  'pii',
  'sql',
  'url',
]);

const LESSON_CONTRADICTION_STOP_WORDS = new Set([
  'about',
  'after',
  'applied',
  'before',
  'corrected',
  'detected',
  'failure',
  'finding',
  'guidance',
  'iteration',
  'lesson',
  'needs',
  'should',
  'until',
  'allow',
  'allows',
  'allowed',
  'permit',
  'permits',
  'permitted',
  'with',
]);
