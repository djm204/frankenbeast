import { GovernorError } from './governor-error.js';

export class TriggerEvaluationError extends GovernorError {
  constructor(
    public readonly triggerId: string,
    reason: string,
  ) {
    super(`Trigger '${triggerId}' evaluation failed: ${reason}`);
    this.name = 'TriggerEvaluationError';
    Object.setPrototypeOf(this, TriggerEvaluationError.prototype);
  }
}
