import type { PlanResult, PlanningStrategyName } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
import type { PlanContext, PlanningStrategy } from './types.js';
export declare class LinearPlanner implements PlanningStrategy {
    readonly name: PlanningStrategyName;
    /**
     * Executes tasks one-by-one in topological order.
     * Stops on the first failure and returns a 'failed' PlanResult.
     * All results accumulated up to and including the failing task are preserved.
     */
    execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult>;
}
//# sourceMappingURL=linear.d.ts.map