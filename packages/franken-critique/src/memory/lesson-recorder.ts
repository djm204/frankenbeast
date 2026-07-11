import type { MemoryPort, CritiqueLesson, ReviewerFeedbackLessonCapture } from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { isoNow } from '@franken/types';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';

const LESSON_EXPERIMENT_SANDBOX_REASON =
  'New critique lessons are experimental until their traceability map and regression evidence are independently verified.';

const MISSING_REVIEWER_SUGGESTION_GUIDANCE =
  'Reviewer feedback did not include suggestions for every finding; PM handoffs should preserve the original message and ask a reviewer to attach remediation guidance before promotion.';

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
          await this.memory.recordLesson(lesson);
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
        });
      }
    }

    return lessons;
  }
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
  const suggestionsComplete = capturedFindings.every((finding) => Boolean(finding.suggestion));

  return {
    summary: capturedFindings.map((finding) => finding.message).join('; '),
    findings: capturedFindings,
    suggestionsComplete,
    ...(suggestionsComplete ? {} : { missingSuggestionGuidance: MISSING_REVIEWER_SUGGESTION_GUIDANCE }),
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
