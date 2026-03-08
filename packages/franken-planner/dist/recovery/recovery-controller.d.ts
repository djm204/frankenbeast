import type { TaskId } from '../core/types.js';
import type { PlanGraph } from '../core/dag.js';
import type { MemoryModule } from '../modules/mod03.js';
import { ErrorIngester } from './error-ingester.js';
import { RecoveryPlanGenerator } from './recovery-plan-generator.js';
/**
 * Orchestrates the self-correction loop (ADR-007).
 *
 * On each failure:
 *   1. Checks attempt against maxAttempts — throws MaxRecoveryAttemptsError if exceeded.
 *   2. Fetches known errors from MOD-03 and classifies the error via ErrorIngester.
 *   3. Known error → injects fix-it task via RecoveryPlanGenerator; returns new PlanGraph.
 *   4. Unknown error → throws UnknownErrorEscalatedError (→ HITL gate in PR-08/09).
 */
export declare class RecoveryController {
    private readonly memory;
    private readonly errorIngester;
    private readonly planGenerator;
    private readonly maxAttempts;
    constructor(memory: MemoryModule, errorIngester?: ErrorIngester, planGenerator?: RecoveryPlanGenerator, maxAttempts?: number);
    recover(failedTaskId: TaskId, error: Error, graph: PlanGraph, attempt: number): Promise<PlanGraph>;
}
//# sourceMappingURL=recovery-controller.d.ts.map