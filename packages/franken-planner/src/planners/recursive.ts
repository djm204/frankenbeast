import { DuplicateTaskError, RecursionDepthExceededError } from '../core/errors.js';
import { PlanGraph } from '../core/dag.js';
import type { PlanResult, Task, TaskId, TaskResult } from '../core/types.js';
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
        const completedTaskIds = new Set<TaskId>([
          ...allResults.map((taskResult) => taskResult.taskId),
          task.id,
        ]);
        const subGraph = this._buildSubGraph(result.newTasks, completedTaskIds);
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

  private _buildSubGraph(tasks: Task[], completedTaskIds: ReadonlySet<TaskId>): PlanGraph {
    const nodes = new Map<Task['id'], Task>();

    for (const task of tasks) {
      if (nodes.has(task.id)) {
        throw new DuplicateTaskError(task.id);
      }
      nodes.set(task.id, task);
    }

    const edges = new Map<Task['id'], Set<Task['id']>>();
    const tasksWithInternalDependencies = tasks.map((task) => {
      const internalDependencies: TaskId[] = [];
      for (const dependencyId of task.dependsOn) {
        if (nodes.has(dependencyId)) {
          internalDependencies.push(dependencyId);
          continue;
        }
        if (!completedTaskIds.has(dependencyId)) {
          throw new Error(
            `Recursive task '${task.id}' depends on unresolved external dependency '${dependencyId}'`
          );
        }
      }
      edges.set(task.id, new Set(internalDependencies));
      return { ...task, dependsOn: internalDependencies };
    });
    PlanGraph.fromTasks(tasksWithInternalDependencies, { reason: 'recursive expansion' });
    return PlanGraph.createWithRawEdges(nodes, edges, 0, 'recursive expansion');
  }

}
