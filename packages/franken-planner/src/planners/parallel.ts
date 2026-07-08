import { RationaleRejectedError, RecursionDepthExceededError } from '../core/errors.js';
import { PlanGraph } from '../core/dag.js';
import type { PlanResult, TaskId, TaskResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';

export interface ParallelPlannerOptions {
  /** Maximum recursive dynamic-expansion depth. Defaults to 10. */
  maxExpansionDepth?: number;

  /**
   * Maximum number of ready tasks to execute at once inside a dependency wave.
   * Omit for the historical fully-parallel behavior.
   */
  maxWaveConcurrency?: number;
}

/**
 * Executes tasks in concurrent waves.
 * Within each wave every ready task (all deps completed) runs with an optional concurrency limit.
 * Stops after a wave that contains at least one failure — subsequent waves are skipped.
 * All results accumulated up to and including the failing wave are preserved.
 */
export class ParallelPlanner implements PlanningStrategy {
  readonly name = 'parallel' as const;

  private readonly maxExpansionDepth: number;
  private readonly maxWaveConcurrency: number;

  constructor(maxExpansionDepth?: number, options?: ParallelPlannerOptions);
  constructor(options?: ParallelPlannerOptions);
  constructor(
    maxExpansionDepthOrOptions: number | ParallelPlannerOptions = 10,
    options: ParallelPlannerOptions = {}
  ) {
    if (typeof maxExpansionDepthOrOptions === 'number') {
      this.maxExpansionDepth = maxExpansionDepthOrOptions;
      this.maxWaveConcurrency = normalizeMaxWaveConcurrency(options.maxWaveConcurrency);
      return;
    }

    this.maxExpansionDepth = maxExpansionDepthOrOptions.maxExpansionDepth ?? 10;
    this.maxWaveConcurrency = normalizeMaxWaveConcurrency(
      maxExpansionDepthOrOptions.maxWaveConcurrency
    );
  }

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
      const settledWaveResults = await this.runWaveSettled(ready, (task) =>
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

      const settledExpansionResults = await Promise.allSettled(
        waveResults
          .filter((r) => r.status === 'success' && r.expand === true)
          .map(async (r) => {
            const subGraph = PlanGraph.fromTasks(r.newTasks);
            const subResult = await this._exec(subGraph, context, depth + 1);
            return { parentTaskId: r.taskId, subResult };
          })
      );

      const rejectedExpansionRationale = settledExpansionResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected' && result.reason instanceof RationaleRejectedError
      );
      if (rejectedExpansionRationale) {
        throw rejectedExpansionRationale.reason;
      }

      const rejectedExpansion = settledExpansionResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      if (rejectedExpansion) {
        throw rejectedExpansion.reason;
      }

      const expansionResults = settledExpansionResults.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        throw result.reason;
      });

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

  private async runWaveSettled<T, R>(
    items: readonly T[],
    runner: (item: T) => Promise<R>
  ): Promise<PromiseSettledResult<R>[]> {
    if (this.maxWaveConcurrency >= items.length) {
      return Promise.allSettled(items.map((item) => runner(item)));
    }

    const settledResults: PromiseSettledResult<R>[] = [];
    for (let start = 0; start < items.length; start += this.maxWaveConcurrency) {
      const batch = items.slice(start, start + this.maxWaveConcurrency);
      settledResults.push(...(await Promise.allSettled(batch.map((item) => runner(item)))));
    }
    return settledResults;
  }
}

function normalizeMaxWaveConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('ParallelPlanner maxWaveConcurrency must be a positive integer');
  }

  return value;
}
