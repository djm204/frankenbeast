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
  for (const task of graph.topoSort()) {
    const change = changeMap.get(task.id);
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
  return PlanGraph.fromTasks(updatedTasks, { version: graph.version, reason: graph.reason });
}
