import { PlanGraph } from '../core/dag.js';
import type { PlanResult, PlanningStrategyName, TaskResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';

export class LinearPlanner implements PlanningStrategy {
  readonly name: PlanningStrategyName = 'linear';

  /**
   * Executes tasks one-by-one in topological order.
   * Stops on the first failure and returns a 'failed' PlanResult.
   * All results accumulated up to and including the failing task are preserved.
   */
  async execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult> {
    const tasks = graph.topoSort();
    const taskResults: TaskResult[] = [];

    for (const task of tasks) {
      const result = await context.executor(task);
      taskResults.push(result);

      if (result.status === 'failure') {
        return {
          status: 'failed',
          taskResults,
          failedTaskId: task.id,
          error: result.error,
        };
      }

      if (result.expand === true) {
        const subGraph = PlanGraph.fromTasks(result.newTasks);
        const subResult = await this.execute(subGraph, context);
        if (subResult.status === 'failed') {
          return {
            ...subResult,
            taskResults: [...taskResults, ...subResult.taskResults],
          };
        }
        if (subResult.status !== 'completed') {
          return subResult;
        }
        taskResults.push(...subResult.taskResults);
      }
    }

    return { status: 'completed', taskResults };
  }
}
