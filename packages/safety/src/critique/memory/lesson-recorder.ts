import type { MemoryPort, CritiqueLesson } from '../types/contracts.js';
import type { CritiqueLoopResult, CritiqueIteration } from '../types/loop.js';
import type { TaskId } from '../types/common.js';

export class LessonRecorder {
  private readonly memory: MemoryPort;

  constructor(memory: MemoryPort) {
    this.memory = memory;
  }

  async record(result: CritiqueLoopResult, taskId: TaskId): Promise<void> {
    // Only record lessons from multi-iteration passes
    if (result.verdict !== 'pass' || result.iterations.length <= 1) {
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
    const passingIteration = allIterations.find((it) => it.result.verdict === 'pass');

    for (const evalResult of failingIteration.result.results) {
      if (evalResult.verdict === 'fail' && evalResult.findings.length > 0) {
        lessons.push({
          evaluatorName: evalResult.evaluatorName,
          failureDescription: evalResult.findings.map((f) => f.message).join('; '),
          correctionApplied: passingIteration
            ? `Corrected in iteration ${passingIteration.index}`
            : 'Unknown correction',
          taskId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return lessons;
  }
}
