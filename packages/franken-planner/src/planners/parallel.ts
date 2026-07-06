import { RationaleRejectedError, RecursionDepthExceededError } from '../core/errors.js';
import { PlanGraph } from '../core/dag.js';
import type { PlanResult, TaskId, TaskResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';

/**
 * Executes tasks in concurrent waves.
 * Within each wave every ready task (all deps completed) runs via Promise.all.
 * Stops after a wave that contains at least one failure — subsequent waves are skipped.
 * All results accumulated up to and including the failing wave are preserved.
 */
export class ParallelPlanner implements PlanningStrategy {
  readonly name = 'parallel' as const;

  constructor(private readonly maxExpansionDepth = 10) {}

  execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult> {
    return this._exec(graph, context, 0);
  }

  private async _exec(graph: PlanGraph, context: PlanContext, depth: number): Promise<PlanResult> {
    if (depth > this.maxExpansionDepth) {
      throw new RecursionDepthExceededError(depth);
    }

    // Validate the DAG up front so cyclic plans fail loudly instead of
    // deadlocking the wave scheduler and returning partial success.
    const tasks = graph.topoSort();
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

      // Run all ready tasks concurrently; convert ordinary task exceptions into
      // failures, but let governance rejections propagate to the Planner so they
      // retain first-class non-retryable semantics across strategies.
      const settledWaveResults = await Promise.allSettled(
        ready.map((task) =>
          context.executor(task).catch((err: unknown) => {
            if (err instanceof RationaleRejectedError) {
              throw err;
            }

            return {
              status: 'failure' as const,
              taskId: task.id,
              error: err instanceof Error ? err : new Error(String(err)),
            };
          })
        )
      );

      const rejectedRationale = settledWaveResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected' && result.reason instanceof RationaleRejectedError
      );
      if (rejectedRationale) {
        throw rejectedRationale.reason;
      }

      const waveResults = settledWaveResults.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }

        // The executor wrapper above converts ordinary exceptions into task
        // failures, so any remaining rejection is unexpected and should keep
        // the strategy contract honest instead of fabricating a task id.
        throw result.reason;
      });

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

      const expansionResults = await Promise.all(
        waveResults
          .filter((r) => r.status === 'success' && r.expand === true)
          .map(async (r) => {
            const subGraph = PlanGraph.fromTasks(r.newTasks);
            const subResult = await this._exec(subGraph, context, depth + 1);
            return { parentTaskId: r.taskId, subResult };
          })
      );

      let firstExpansionFailure: { taskId: TaskId; error: Error } | undefined;
      for (const { parentTaskId, subResult } of expansionResults) {
        if (subResult.status === 'failed') {
          allResults.push(...subResult.taskResults);
          firstExpansionFailure ??= { taskId: parentTaskId, error: subResult.error };
          continue;
        }
        if (subResult.status !== 'completed') {
          return subResult;
        }
        allResults.push(...subResult.taskResults);
      }

      if (firstExpansionFailure) {
        return {
          status: 'failed',
          taskResults: allResults,
          failedTaskId: firstExpansionFailure.taskId,
          error: firstExpansionFailure.error,
        };
      }

      for (const r of waveResults) {
        completedIds.add(r.taskId);
      }
    }

    return { status: 'completed', taskResults: allResults };
  }
}
