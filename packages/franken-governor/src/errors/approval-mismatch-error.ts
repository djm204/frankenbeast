import { GovernorError } from './governor-error.js';

export class ApprovalMismatchError extends GovernorError {
  constructor(
    public readonly expectedRequestId: string,
    public readonly actualRequestId: string,
  ) {
    super(
      `Approval response is bound to request '${actualRequestId}' but the active request is '${expectedRequestId}'`,
    );
    this.name = 'ApprovalMismatchError';
    Object.setPrototypeOf(this, ApprovalMismatchError.prototype);
  }
}
