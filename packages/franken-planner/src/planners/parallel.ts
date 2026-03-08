import type { PlanResult, TaskId, TaskResult } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
import type { PlanContext, PlanningStrategy } from './types.js';

/**
 * Executes tasks in concurrent waves.
 * Within each wave every ready task (all deps completed) runs via Promise.all.
 * Stops after a wave that contains at least one failure — subsequent waves are skipped.
 * All results accumulated up to and including the failing wave are preserved.
 */
export class ParallelPlanner implements PlanningStrategy {
  readonly name = 'parallel' as const;

  async execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult> {
    const tasks = graph.getTasks();
    const completedIds = new Set<TaskId>();
    const allResults: TaskResult[] = [];

    while (completedIds.size < tasks.length) {
      // Collect tasks whose every dependency is already completed
      const ready = tasks.filter(
        (t) =>
          !completedIds.has(t.id) &&
          graph.getDependencies(t.id).every((dep) => completedIds.has(dep))
      );

      if (ready.length === 0) break; // no progress — cycle guard (should not happen in a valid DAG)

      // Run all ready tasks concurrently; wrap executor so Promise.all never rejects
      const waveResults = await Promise.all(
        ready.map((task) =>
          context.executor(task).catch((err: unknown) => ({
            status: 'failure' as const,
            taskId: task.id,
            error: err instanceof Error ? err : new Error(String(err)),
          }))
        )
      );

      allResults.push(...waveResults);

      const failures = waveResults.filter((r) => r.status === 'failure');
      if (failures.length > 0) {
        const first = failures[0]!;
        if (first.status === 'failure') {
          return {
            status: 'failed',
            taskResults: allResults,
            failedTaskId: first.taskId,
            error: first.error,
          };
        }
      }

      for (const r of waveResults) {
        completedIds.add(r.taskId);
      }
    }

    return { status: 'completed', taskResults: allResults };
  }
}
