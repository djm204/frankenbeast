import { RecursionDepthExceededError } from '../core/errors.js';
import { PlanGraph } from '../core/dag.js';
import type { PlanResult, TaskResult, Task } from '../core/types.js';
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
        const subGraph = this._buildSubGraph(result.newTasks);
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

  /**
   * Builds a PlanGraph from an array of Task objects.
   * Tasks may reference each other via their `dependsOn` field.
   * Uses insertion-order topological sort: tasks with satisfied deps are added first.
   */
  private _buildSubGraph(tasks: Task[]): PlanGraph {
    const added = new Set<string>();
    const ordered: Task[] = [];
    const remaining = [...tasks];

    while (remaining.length > 0) {
      const prevLen = remaining.length;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const task = remaining[i]!;
        if (task.dependsOn.every((dep) => added.has(dep))) {
          ordered.push(task);
          added.add(task.id);
          remaining.splice(i, 1);
        }
      }
      if (remaining.length === prevLen) break; // cycle guard — avoid infinite loop
    }

    let graph = PlanGraph.empty();
    for (const task of ordered) {
      const deps = task.dependsOn.filter((d) => added.has(d));
      graph = graph.addTask(task, deps);
    }
    return graph;
  }
}
