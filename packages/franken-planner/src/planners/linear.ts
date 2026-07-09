import { PlanGraph } from '../core/dag.js';
import { RationaleRejectedError, RecursionDepthExceededError } from '../core/errors.js';
import type { PlanResult, PlanningStrategyName, TaskResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';

export class LinearPlanner implements PlanningStrategy {
  readonly name: PlanningStrategyName = 'linear';

  constructor(private readonly maxExpansionDepth = 10) {}

  /**
   * Executes tasks one-by-one in topological order.
   * Stops on the first failure and returns a 'failed' PlanResult.
   * All results accumulated up to and including the failing task are preserved.
   */
  execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult> {
    return this._exec(graph, context, 0);
  }

  private async _exec(graph: PlanGraph, context: PlanContext, depth: number): Promise<PlanResult> {
    if (depth > this.maxExpansionDepth) {
      throw new RecursionDepthExceededError(depth);
    }

    const tasks = graph.topoSort();
    const taskResults: TaskResult[] = [];

    for (const task of tasks) {
      if (context.completedTaskIds?.has(task.id)) {
        continue;
      }

      let result: TaskResult;
      try {
        result = await context.executor(task);
      } catch (err) {
        if (err instanceof RationaleRejectedError) {
          throw err;
        }
        result = {
          status: 'failure',
          taskId: task.id,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }

      if (result.status === 'failure') {
        taskResults.push(result);
        return {
          status: 'failed',
          taskResults,
          failedTaskId: task.id,
          error: result.error,
        };
      }

      if (result.expand === true) {
        const subGraph = PlanGraph.fromTasks(result.newTasks);
        const subResult = await this._exec(subGraph, context, depth + 1);
        if (subResult.status === 'failed') {
          return {
            status: 'failed',
            taskResults: [...taskResults, ...subResult.taskResults],
            failedTaskId: result.taskId,
            error: subResult.error,
          };
        }
        if (subResult.status !== 'completed') {
          return subResult;
        }
        taskResults.push(result, ...subResult.taskResults);
        continue;
      }

      taskResults.push(result);
    }

    return { status: 'completed', taskResults };
  }
}
