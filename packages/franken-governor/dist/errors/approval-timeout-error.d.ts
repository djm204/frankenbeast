import { GovernorError } from './governor-error.js';
export declare class ApprovalTimeoutError extends GovernorError {
    readonly requestId: string;
    readonly timeoutMs: number;
    constructor(requestId: string, timeoutMs: number);
}
//# sourceMappingURL=approval-timeout-error.d.ts.map