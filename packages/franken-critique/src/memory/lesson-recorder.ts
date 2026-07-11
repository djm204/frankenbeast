import type {
  MemoryPort,
  CritiqueLesson,
  LessonRollbackWorkflow,
  LessonTestTraceabilityEntry,
} from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { isoNow } from '@franken/types';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';

const LESSON_ROLLBACK_REQUIRED_EVIDENCE = [
  'rollbackReason',
  'supersedingFindingOrRegression',
] as const;

const LESSON_ROLLBACK_STEPS = [
  'Attach the rollback reason and superseding evidence to the PM handoff.',
  'Mark the lesson as rolled back or superseded in the memory store; do not delete the original audit record.',
  'Run the lesson verification command before promoting a replacement lesson.',
] as const;

export function createLessonRollbackWorkflow(
  traceability: LessonTestTraceabilityEntry,
): LessonRollbackWorkflow {
  return {
    rollbackId: `${traceability.lessonId}:rollback`,
    lessonId: traceability.lessonId,
    taskId: traceability.taskId,
    evaluatorName: traceability.evaluatorName,
    state: 'active',
    requiredEvidence: LESSON_ROLLBACK_REQUIRED_EVIDENCE,
    rollbackSteps: LESSON_ROLLBACK_STEPS,
    verificationCommand: traceability.verificationCommand,
    operatorMessage:
      `Rollback ${traceability.lessonId} only with a concrete reason and superseding evidence; ` +
      'preserve the original lesson for audit history.',
  };
}

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
        const traceability: LessonTestTraceabilityEntry = {
          lessonId,
          taskId,
          evaluatorName: evalResult.evaluatorName,
          failingIteration: failingIteration.index,
          resolvedIteration,
          sourceFindingMessages: findingMessages,
          testId: `${lessonId}:regression`,
          verificationCommand: LESSON_TRACEABILITY_VERIFICATION_COMMAND,
        };

        lessons.push({
          evaluatorName: evalResult.evaluatorName,
          failureDescription: findingMessages.join('; '),
          correctionApplied: passingIteration
            ? `Corrected in iteration ${passingIteration.index}`
            : 'Unknown correction',
          taskId,
          timestamp: isoNow(),
          testTraceability: [traceability],
          rollbackWorkflow: createLessonRollbackWorkflow(traceability),
        });
      }
    }

    return lessons;
  }
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
