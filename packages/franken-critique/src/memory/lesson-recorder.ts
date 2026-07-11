import type { MemoryPort, CritiqueLesson, AgentImprovementScorecard } from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../types/evaluation.js';
import { isoNow } from '@franken/types';

const LESSON_TRACEABILITY_VERIFICATION_COMMAND =
  'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts';

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
          improvementScorecard: createImprovementScorecard({
            taskId,
            evaluatorName: evalResult.evaluatorName,
            failingIteration,
            resolvedIteration,
            baselineScore: evalResult.score,
            resolvedScore: passingIteration?.result.overallScore ?? failingIteration.result.overallScore,
          }),
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

function createImprovementScorecard(input: {
  taskId: TaskId;
  evaluatorName: string;
  failingIteration: CritiqueIteration;
  resolvedIteration: number;
  baselineScore: number;
  resolvedScore: number;
}): AgentImprovementScorecard {
  const agentId = getAgentId(input.failingIteration);
  const baselineScore = stableScore(input.baselineScore);
  const resolvedScore = stableScore(input.resolvedScore);
  const improvementDelta = stableScore(resolvedScore - baselineScore);
  const retryCount = Math.max(0, input.resolvedIteration - input.failingIteration.index);

  return {
    agentId: agentId.value,
    taskId: input.taskId,
    evaluatorName: input.evaluatorName,
    failedIteration: input.failingIteration.index,
    resolvedIteration: input.resolvedIteration,
    baselineScore,
    resolvedScore,
    improvementDelta,
    retryCount,
    agentIdSource: agentId.source,
    summary: `${agentId.value} improved ${input.evaluatorName} from ${baselineScore} to ${resolvedScore} after ${retryCount} ${retryCount === 1 ? 'retry' : 'retries'}.`,
  };
}

function getAgentId(iteration: CritiqueIteration): {
  value: string;
  source: AgentImprovementScorecard['agentIdSource'];
} {
  const rawAgentId = iteration.input.metadata['agentId'];
  if (typeof rawAgentId === 'string' && rawAgentId.trim().length > 0) {
    return { value: rawAgentId.trim(), source: 'metadata' };
  }

  return { value: 'unknown-agent', source: 'fallback' };
}

function stableScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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
