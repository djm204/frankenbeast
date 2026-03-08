import type { Task, TaskId } from './types.js';
import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from './errors.js';
export type { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError };
export interface PlanVersion {
    version: number;
    graph: PlanGraph;
    reason: string;
    timestamp: Date;
}
export declare class PlanGraph {
    private readonly _nodes;
    private readonly _edges;
    readonly version: number;
    readonly reason: string;
    private constructor();
    static empty(): PlanGraph;
    /** Escape hatch for testing — builds a graph without validation (e.g. to force a cycle). */
    static createWithRawEdges(nodes: Map<TaskId, Task>, edges: Map<TaskId, Set<TaskId>>, version?: number, reason?: string): PlanGraph;
    getTask(taskId: TaskId): Task | undefined;
    getTasks(): Task[];
    getDependencies(taskId: TaskId): TaskId[];
    size(): number;
    hasCycle(): boolean;
    /**
     * Returns tasks ordered so every prerequisite appears before its dependents.
     * Throws CyclicDependencyError if the graph contains a cycle.
     */
    topoSort(): Task[];
    addTask(task: Task, dependsOn?: TaskId[]): PlanGraph;
    removeTask(taskId: TaskId): PlanGraph;
    /**
     * Inserts `fixTask` as a prerequisite for `failedTaskId`:
     *   - fixTask inherits failedTask's current dependencies
     *   - failedTask's dependencies become {fixTask.id}
     * Increments version and sets a recovery reason.
     */
    insertFixItTask(failedTaskId: TaskId, fixTask: Task): PlanGraph;
    clone(): PlanGraph;
    /** Kahn's BFS topological sort. Returns sorted ids (may be shorter than nodes if cyclic). */
    private _kahn;
}
export declare function createPlanVersion(graph: PlanGraph, reason: string): PlanVersion;
//# sourceMappingURL=dag.d.ts.map