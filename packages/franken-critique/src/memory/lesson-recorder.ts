import type {
  MemoryPort,
  CritiqueLesson,
  LessonCooldownSuppression,
  LessonRecordingResult,
  ReviewerFeedbackLessonCapture,
  PostPrLessonExtractionTemplate,
  CrossTaskBlockerPattern,
} from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { createHash } from 'node:crypto';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';

const DEFAULT_LESSON_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_LESSON_COOLDOWN_MS = 100 * 365 * 24 * 60 * 60 * 1000;
const PENDING_ADMISSIONS_BY_COOLDOWN_STORE = new WeakMap<
  Map<string, number>,
  Map<string, Promise<boolean>>
>();

const LEARNING_COOLDOWN_GUIDANCE =
  'Equivalent critique lessons are suppressed during this cooldown window so PM/liveness tooling does not churn on repeated feedback before promotion or retirement review.';
const DEFAULT_BLOCKER_PATTERN_THRESHOLD = 3;
const MIN_BLOCKER_PATTERN_THRESHOLD = 2;
const BLOCKER_PATTERN_GUIDANCE =
  'Equivalent blocker findings have recurred across distinct tasks; PM/liveness handoffs should treat this as a cross-task pattern and route a durable mitigation instead of rediscovering it per task.';

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
}

const LESSON_EXPERIMENT_SANDBOX_REASON =
  'New critique lessons are experimental until their traceability map and regression evidence are independently verified.';

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
  private readonly pendingBlockerAdmissions = new Map<string, Promise<void>>();
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
    const recordingResult = createMutableLessonRecordingResult();

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
      const cooldownKey = this.cooldownMs > 0 ? lesson.cooldown?.key : undefined;
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
        const admittedLesson = this.withAdmissionTimestamp(lesson);
        await this.memory.recordLesson(admittedLesson);
        recordingResult.recorded += 1;
        this.commitBlockerPatternObservations(lesson);
        addUniqueBlockerPatterns(
          recordingResult.minedBlockerPatterns,
          lesson.blockerPatterns,
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
              'Run the listed verification command and attach the evidence to the PM handoff.',
              'Promote or retire the lesson only after review confirms the regression covers the source finding.',
            ],
            verificationCommand: LESSON_TRACEABILITY_VERIFICATION_COMMAND,
          },
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
      cooldown: {
        ...lesson.cooldown,
        recordedAt,
        suppressUntil,
      },
    };
  }
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

interface MutableLessonRecordingResult {
  recorded: number;
  suppressedByCooldown: LessonCooldownSuppression[];
  minedBlockerPatterns: CrossTaskBlockerPattern[];
}

function createMutableLessonRecordingResult(): MutableLessonRecordingResult {
  return {
    recorded: 0,
    suppressedByCooldown: [],
    minedBlockerPatterns: [],
  };
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

function createPostPrLessonExtractionTemplate(): PostPrLessonExtractionTemplate {
  return {
    ...POST_PR_LESSON_EXTRACTION_TEMPLATE,
    instructions: [...POST_PR_LESSON_EXTRACTION_TEMPLATE.instructions],
    requiredEvidence: [...POST_PR_LESSON_EXTRACTION_TEMPLATE.requiredEvidence],
    outputSchema: { ...POST_PR_LESSON_EXTRACTION_TEMPLATE.outputSchema },
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
