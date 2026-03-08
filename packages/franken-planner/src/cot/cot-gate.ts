import { RationaleRejectedError } from '../core/errors.js';
import type { TaskExecutor } from '../planners/types.js';
import type { SelfCritiqueModule } from '../modules/mod07.js';
import { RationaleEnforcer } from './rationale-enforcer.js';

/**
 * Wraps a TaskExecutor with a Chain-of-Thought gate (ADR-004 CoT enforcement).
 *
 * For each task dispatched the gate:
 *   1. Generates a RationaleBlock via the enforcer.
 *   2. Calls selfCritique.verifyRationale — blocks until verdict received.
 *   3. Approved → forwards task to the underlying executor.
 *   4. Rejected → throws RationaleRejectedError (task never reaches executor).
 *
 * The caller is responsible for catching RationaleRejectedError and converting
 * it to an appropriate PlanResult (handled by the Planner orchestrator in PR-09).
 */
export function buildCoTExecutor(
  executor: TaskExecutor,
  selfCritique: SelfCritiqueModule,
  enforcer: RationaleEnforcer = new RationaleEnforcer()
): TaskExecutor {
  return async (task) => {
    const rationale = enforcer.generate(task);
    const verification = await selfCritique.verifyRationale(rationale);

    if (verification.verdict === 'rejected') {
      throw new RationaleRejectedError(task.id, verification.reason);
    }

    return executor(task);
  };
}
