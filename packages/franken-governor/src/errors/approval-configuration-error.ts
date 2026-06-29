import { GovernorError } from './governor-error.js';

export class ApprovalConfigurationError extends GovernorError {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalConfigurationError';
    Object.setPrototypeOf(this, ApprovalConfigurationError.prototype);
  }
}
