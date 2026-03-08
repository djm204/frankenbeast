import type { PlanResult } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
import type { PlanContext, PlanningStrategy } from './types.js';
/**
 * Executes tasks in concurrent waves.
 * Within each wave every ready task (all deps completed) runs via Promise.all.
 * Stops after a wave that contains at least one failure — subsequent waves are skipped.
 * All results accumulated up to and including the failing wave are preserved.
 */
export declare class ParallelPlanner implements PlanningStrategy {
    readonly name: "parallel";
    execute(graph: PlanGraph, context: PlanContext): Promise<PlanResult>;
}
//# sourceMappingURL=parallel.d.ts.map