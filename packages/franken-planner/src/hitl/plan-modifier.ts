import { PlanGraph } from '../core/dag.js';
import type { Task } from '../core/types.js';
import type { TaskModification } from './types.js';

/**
 * Applies a set of TaskModification changes to a PlanGraph and returns a new graph.
 * Modifications that reference unknown task ids are silently ignored.
 * Edges (dependencies) are fully preserved.
 * The original graph is not mutated (ADR-007).
 */
export function applyModifications(graph: PlanGraph, changes: TaskModification[]): PlanGraph {
  if (changes.length === 0) return graph;

  const changeMap = new Map(changes.map((c) => [c.taskId, c]));

  const updatedTasks: Task[] = [];
  let modified = false;
  for (const task of graph.topoSort()) {
    const change = changeMap.get(task.id);
    if (change !== undefined) modified = true;
    const updatedTask: Task = change
      ? {
          ...task,
          ...(change.objective !== undefined ? { objective: change.objective } : {}),
          ...(change.requiredSkills !== undefined
            ? { requiredSkills: change.requiredSkills }
            : {}),
        }
      : task;
    updatedTasks.push({ ...updatedTask, dependsOn: graph.getDependencies(task.id) });
  }
  if (!modified) return graph;
  return PlanGraph.fromTasks(updatedTasks, {
    version: graph.version + 1,
    reason: 'human modifications applied',
  });
}
