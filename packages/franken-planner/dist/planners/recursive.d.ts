import { PlanGraph } from '../core/dag.js';
import type { PlanResult } from '../core/types.js';
import type { PlanContext, PlanningStrategy } from './types.js';
/**
 * Executes tasks in topological order.
 * When a task returns { expand: true, newTasks }, builds a sub-graph from
 * those tasks and recursively executes it at depth+1.
 * Throws RecursionDepthExceededError if depth exceeds maxDepth.
 * Stops on the first failure, propagating it upward.
 */
export declare class RecursivePlanner implements PlanningStrategy {
    private readonly maxDepth;
    readonly name: "recursive";
    constructor(maxDepth?: number);
    execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult>;
    private _exec;
    /**
     * Builds a PlanGraph from an array of Task objects.
     * Tasks may reference each other via their `dependsOn` field.
     * Uses insertion-order topological sort: tasks with satisfied deps are added first.
     */
    private _buildSubGraph;
}
//# sourceMappingURL=recursive.d.ts.map