import { GovernorError } from './governor-error.js';
export class TriggerEvaluationError extends GovernorError {
    triggerId;
    constructor(triggerId, reason) {
        super(`Trigger '${triggerId}' evaluation failed: ${reason}`);
        this.triggerId = triggerId;
        this.name = 'TriggerEvaluationError';
        Object.setPrototypeOf(this, TriggerEvaluationError.prototype);
    }
}
//# sourceMappingURL=trigger-evaluation-error.js.map