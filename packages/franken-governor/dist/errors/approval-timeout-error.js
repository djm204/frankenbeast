import { GovernorError } from './governor-error.js';
export class ApprovalTimeoutError extends GovernorError {
    requestId;
    timeoutMs;
    constructor(requestId, timeoutMs) {
        super(`Approval request '${requestId}' timed out after ${timeoutMs}ms`);
        this.requestId = requestId;
        this.timeoutMs = timeoutMs;
        this.name = 'ApprovalTimeoutError';
        Object.setPrototypeOf(this, ApprovalTimeoutError.prototype);
    }
}
//# sourceMappingURL=approval-timeout-error.js.map