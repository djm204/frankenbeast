import type { TaskId, KnownError } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
/**
 * Generates a recovery plan by injecting a fix-it task before the failed task.
 * Uses PlanGraph.insertFixItTask so the fix inherits the failed task's dependencies
 * and the failed task becomes dependent on the fix (ADR-007).
 */
export declare class RecoveryPlanGenerator {
    generate(failedTaskId: TaskId, knownError: KnownError, graph: PlanGraph, attempt: number): PlanGraph;
}
//# sourceMappingURL=recovery-plan-generator.d.ts.map