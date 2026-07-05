import { PlanGraph } from '../core/dag.js';
import type { Task, TaskId } from '../core/types.js';

/**
 * Inserts `fixTask` as a prerequisite for `failedTaskId`:
 *   - fixTask inherits failedTask's current graph dependencies
 *   - failedTask's dependencies become {fixTask.id}
 *
 * Kept in the recovery domain so PlanGraph remains a generic DAG container.
 */
export function insertFixItTask(graph: PlanGraph, failedTaskId: TaskId, fixTask: Task): PlanGraph {
  return graph.insertFixItTask(failedTaskId, fixTask);
}
