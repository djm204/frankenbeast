import { RecursionDepthExceededError } from '../core/errors.js';
import { PlanGraph } from '../core/dag.js';
import type { PlanResult, TaskResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';

/**
 * Executes tasks in topological order.
 * When a task returns { expand: true, newTasks }, builds a sub-graph from
 * those tasks and recursively executes it at depth+1.
 * Throws RecursionDepthExceededError if depth exceeds maxDepth.
 * Stops on the first failure, propagating it upward.
 */
export class RecursivePlanner implements PlanningStrategy {
  readonly name = 'recursive' as const;

  constructor(private readonly maxDepth = 10) {}

  execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult> {
    return this._exec(graph, context, 0);
  }

  private async _exec(
    graph: PlanGraph,
    context: PlanContext,
    depth: number
  ): Promise<PlanResult> {
    if (depth > this.maxDepth) {
      throw new RecursionDepthExceededError(depth);
    }

    const tasks = graph.topoSort();
    const allResults: TaskResult[] = [];

    for (const task of tasks) {
      const result = await context.executor(task);

      if (result.status === 'failure') {
        allResults.push(result);
        return {
          status: 'failed',
          taskResults: allResults,
          failedTaskId: task.id,
          error: result.error,
        };
      }

      if (result.expand === true) {
        const subGraph = PlanGraph.fromTasks(result.newTasks);
        const subResult = await this._exec(subGraph, context, depth + 1);
        if (subResult.status !== 'completed') {
          return subResult;
        }
        allResults.push(result, ...subResult.taskResults);
      } else {
        allResults.push(result);
      }
    }

    return { status: 'completed', taskResults: allResults };
  }

}
