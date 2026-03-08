import { MaxRecoveryAttemptsError, UnknownErrorEscalatedError } from '../core/errors.js';
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
export class RecoveryController {
  constructor(
    private readonly memory: MemoryModule,
    private readonly errorIngester = new ErrorIngester(),
    private readonly planGenerator = new RecoveryPlanGenerator(),
    private readonly maxAttempts = 3
  ) {}

  async recover(failedTaskId: TaskId, error: Error, graph: PlanGraph, attempt: number): Promise<PlanGraph> {
    if (attempt > this.maxAttempts) {
      throw new MaxRecoveryAttemptsError(failedTaskId, this.maxAttempts);
    }

    const knownErrors = await this.memory.getKnownErrors();
    const classification = this.errorIngester.classify(error, knownErrors);

    if (classification.type === 'unknown') {
      throw new UnknownErrorEscalatedError(failedTaskId, error);
    }

    return this.planGenerator.generate(failedTaskId, classification.knownError, graph, attempt);
  }
}
