import { GovernorError } from './governor-error.js';

export class SignatureVerificationError extends GovernorError {
  constructor(public readonly requestId: string) {
    super(`Signature verification failed for approval request '${requestId}'`);
    this.name = 'SignatureVerificationError';
    Object.setPrototypeOf(this, SignatureVerificationError.prototype);
  }
}
