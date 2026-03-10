import { GovernorError } from './governor-error.js';

export class ApprovalTimeoutError extends GovernorError {
  constructor(
    public readonly requestId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Approval request '${requestId}' timed out after ${timeoutMs}ms`);
    this.name = 'ApprovalTimeoutError';
    Object.setPrototypeOf(this, ApprovalTimeoutError.prototype);
  }
}
