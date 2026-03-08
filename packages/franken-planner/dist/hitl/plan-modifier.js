import { PlanGraph } from '../core/dag.js';
/**
 * Applies a set of TaskModification changes to a PlanGraph and returns a new graph.
 * Modifications that reference unknown task ids are silently ignored.
 * Edges (dependencies) are fully preserved.
 * The original graph is not mutated (ADR-007).
 */
export function applyModifications(graph, changes) {
    if (changes.length === 0)
        return graph;
    const changeMap = new Map(changes.map((c) => [c.taskId, c]));
    // Rebuild in topological order so addTask dependency references always resolve.
    let result = PlanGraph.empty();
    for (const task of graph.topoSort()) {
        const change = changeMap.get(task.id);
        const updatedTask = change
            ? {
                ...task,
                ...(change.objective !== undefined ? { objective: change.objective } : {}),
                ...(change.requiredSkills !== undefined
                    ? { requiredSkills: change.requiredSkills }
                    : {}),
            }
            : task;
        result = result.addTask(updatedTask, graph.getDependencies(task.id));
    }
    return result;
}
//# sourceMappingURL=plan-modifier.js.map