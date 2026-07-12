import type {
  MemoryPort,
  CritiqueLesson,
  LessonCooldownSuppression,
  LessonRecordingResult,
  ReviewerFeedbackLessonCapture,
  PostPrLessonExtractionTemplate,
} from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { isoNow } from '@franken/types';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';

const DEFAULT_LESSON_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_LESSON_COOLDOWN_MS = 100 * 365 * 24 * 60 * 60 * 1000;

const LEARNING_COOLDOWN_GUIDANCE =
  'Equivalent critique lessons are suppressed during this cooldown window so PM/liveness tooling does not churn on repeated feedback before promotion or retirement review.';

export interface LessonRecorderOptions {
  /** Milliseconds to suppress equivalent lessons after one is admitted. Defaults to 24 hours. */
  readonly cooldownMs?: number;
  /** Clock injection for deterministic tests and replay tooling. */
  readonly now?: () => Date | string;
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
  private readonly cooldowns = new Map<string, number>();

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
    const now = options.now ?? isoNow;
    this.now = (): string => normalizeTimestamp(now());
  }

  async record(
    result: CritiqueLoopResult,
    taskId: TaskId,
  ): Promise<LessonRecordingResult> {
    const recordingResult: MutableLessonRecordingResult = {
      recorded: 0,
      suppressedByCooldown: [],
    };

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
      for (const lesson of lessons) {
        const cooldownKey = lesson.cooldown?.key;
        let reservedUntilMs: number | null = null;
        let previousSuppressUntilMs: number | undefined;
        if (cooldownKey) {
          const suppression = this.getCooldownSuppression(lesson, cooldownKey);
          if (suppression) {
            recordingResult.suppressedByCooldown.push(suppression);
            continue;
          }

          if (this.cooldownMs > 0) {
            previousSuppressUntilMs = this.cooldowns.get(cooldownKey);
            reservedUntilMs = Date.parse(lesson.cooldown!.suppressUntil);
            this.cooldowns.set(cooldownKey, reservedUntilMs);
          }
        }

        try {
          await this.memory.recordLesson(lesson);
          recordingResult.recorded += 1;
        } catch {
          if (cooldownKey && reservedUntilMs !== null) {
            if (previousSuppressUntilMs === undefined) {
              this.cooldowns.delete(cooldownKey);
            } else {
              this.cooldowns.set(cooldownKey, previousSuppressUntilMs);
            }
          }
          // Non-fatal: log failure but don't disrupt the critique flow
        }
      }
    }

    return recordingResult;
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
        this.pruneExpiredCooldowns(Date.parse(recordedAt));
        const cooldownKey = createCooldownKey(
          evalResult.evaluatorName,
          findingMessages,
        );
        const suppressUntil = addCooldownWindow(recordedAt, this.cooldownMs);

        lessons.push({
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
        });
      }
    }

    return lessons;
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
}

interface MutableLessonRecordingResult {
  recorded: number;
  suppressedByCooldown: LessonCooldownSuppression[];
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
  const normalizedFindings = JSON.stringify(
    findingMessages.map((message) => message.trim()).sort(),
  );
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

function addCooldownWindow(recordedAt: string, cooldownMs: number): string {
  const suppressUntilMs = Date.parse(recordedAt) + cooldownMs;
  if (!Number.isFinite(suppressUntilMs)) {
    throw new RangeError(
      'LessonRecorder cooldownMs produced an invalid suppressUntil timestamp.',
    );
  }
  return new Date(suppressUntilMs).toISOString();
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeLessonIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'unknown';
}
