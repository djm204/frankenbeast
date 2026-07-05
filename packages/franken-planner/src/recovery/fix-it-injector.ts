import { PlanGraph } from '../core/dag.js';
import { DuplicateTaskError, TaskNotFoundError } from '../core/errors.js';
import type { Task, TaskId } from '../core/types.js';

/**
 * Inserts `fixTask` as a prerequisite for `failedTaskId`:
 *   - fixTask inherits failedTask's current graph dependencies
 *   - failedTask's dependencies become {fixTask.id}
 *
 * Kept in the recovery domain so PlanGraph remains a generic DAG container.
 */
export function insertFixItTask(graph: PlanGraph, failedTaskId: TaskId, fixTask: Task): PlanGraph {
  const failedTask = graph.getTask(failedTaskId);
  if (!failedTask) {
    throw new TaskNotFoundError(failedTaskId);
  }
  if (graph.getTask(fixTask.id)) {
    throw new DuplicateTaskError(fixTask.id);
  }

  const tasks = graph.getTasks().map((task) => {
    if (task.id === failedTaskId) {
      return { ...task, dependsOn: [fixTask.id] };
    }
    return { ...task, dependsOn: graph.getDependencies(task.id) };
  });

  const fixTaskWithInheritedDependencies: Task = {
    ...fixTask,
    dependsOn: graph.getDependencies(failedTaskId),
  };

  return PlanGraph.fromTasks([...tasks, fixTaskWithInheritedDependencies], {
    version: graph.version + 1,
    reason: `recovery: fix-it injected before '${failedTaskId}'`,
  });
}
