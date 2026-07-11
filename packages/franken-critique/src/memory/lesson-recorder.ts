import type { MemoryPort, CritiqueLesson, LessonContradictionReport } from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { isoNow } from '@franken/types';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';
const LESSON_CONTRADICTION_VERIFICATION_COMMAND = LESSON_TRACEABILITY_VERIFICATION_COMMAND;

const LESSON_EXPERIMENT_SANDBOX_REASON =
  'New critique lessons are experimental until their traceability map and regression evidence are independently verified.';

export class LessonRecorder {
  private readonly memory: MemoryPort;

  constructor(memory: MemoryPort) {
    this.memory = memory;
  }

  async record(result: CritiqueLoopResult, taskId: TaskId): Promise<void> {
    // Only record lessons from multi-iteration pass/warn successes.
    if ((result.verdict !== 'pass' && result.verdict !== 'warn') || result.iterations.length <= 1) {
      return;
    }

    const failingIterations = result.iterations.filter(
      (it) => it.result.verdict === 'fail',
    );

    for (const iteration of failingIterations) {
      const lessons = this.extractLessons(iteration, result.iterations, taskId);
      for (const lesson of lessons) {
        try {
          const priorLessons = this.memory.searchLessons
            ? await this.memory.searchLessons(createLessonSearchQuery(lesson), 10)
            : undefined;
          await this.memory.recordLesson({
            ...lesson,
            contradictionReport: detectLessonContradictions(lesson, priorLessons),
          });
        } catch {
          // Non-fatal: log failure but don't disrupt the critique flow
        }
      }
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
        const resolvedIteration = passingIteration?.index ?? failingIteration.index;
        const lessonId = createLessonId(taskId, evalResult.evaluatorName, failingIteration.index);
        const findingMessages = critiqueFindings.map((f) => f.message);

        lessons.push({
          evaluatorName: evalResult.evaluatorName,
          failureDescription: findingMessages.join('; '),
          correctionApplied: passingIteration
            ? `Corrected in iteration ${passingIteration.index}`
            : 'Unknown correction',
          taskId,
          timestamp: isoNow(),
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
        });
      }
    }

    return lessons;
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

  const comparablePriorLessons = priorLessons.filter((prior) => prior !== lesson);

  const contradictions = comparablePriorLessons.flatMap((prior, index) => {
    const sharedTerms = sharedLessonTerms(lesson, prior);
    const hasNegationMismatch =
      containsNegation(lesson.correctionApplied) !== containsNegation(prior.correctionApplied);

    if (!sameEvaluator(lesson, prior) || sharedTerms.length === 0 || !hasNegationMismatch) {
      return [];
    }

    return [
      {
        conflictingLessonId: getLessonId(prior) ?? `prior-lesson-${index}`,
        evaluatorName: prior.evaluatorName,
        sharedTerms,
        reason:
          'A prior lesson from the same evaluator discusses the same normalized terms but reverses negated guidance; review before promotion.',
        conflictingFailureDescription: prior.failureDescription,
        conflictingCorrectionApplied: prior.correctionApplied,
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
    guidance: 'No deterministic lesson contradiction was detected among comparable prior lessons.',
    verificationCommand: LESSON_CONTRADICTION_VERIFICATION_COMMAND,
    contradictions: [],
  };
}

function createLessonId(taskId: TaskId, evaluatorName: string, iterationIndex: number): string {
  return [taskId, evaluatorName, `iteration-${iterationIndex}`]
    .map((part) => sanitizeLessonIdPart(part))
    .join(':');
}

function sanitizeLessonIdPart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'unknown';
}

function createLessonSearchQuery(lesson: CritiqueLesson): string {
  return `${lesson.evaluatorName} ${lesson.failureDescription} ${lesson.correctionApplied}`;
}

function sameEvaluator(a: CritiqueLesson, b: CritiqueLesson): boolean {
  return normalizeText(a.evaluatorName) === normalizeText(b.evaluatorName);
}

function sharedLessonTerms(a: CritiqueLesson, b: CritiqueLesson): string[] {
  const aTerms = new Set(extractComparableTerms(`${a.failureDescription} ${a.correctionApplied}`));
  const bTerms = new Set(extractComparableTerms(`${b.failureDescription} ${b.correctionApplied}`));
  return [...aTerms].filter((term) => bTerms.has(term)).sort();
}

function extractComparableTerms(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((term) => term.length >= 4 && !LESSON_CONTRADICTION_STOP_WORDS.has(term));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsNegation(value: string): boolean {
  return /\b(no|not|never|avoid|block|reject|forbid|without|disable|disabled|don'?t|do not|must not|cannot|can't)\b/i.test(
    value,
  );
}

function getLessonId(lesson: CritiqueLesson): string | undefined {
  return lesson.testTraceability?.[0]?.lessonId;
}

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
  'with',
]);
