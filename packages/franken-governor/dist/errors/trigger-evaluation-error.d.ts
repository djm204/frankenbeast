import { GovernorError } from './governor-error.js';
export declare class TriggerEvaluationError extends GovernorError {
    readonly triggerId: string;
    constructor(triggerId: string, reason: string);
}
//# sourceMappingURL=trigger-evaluation-error.d.ts.map