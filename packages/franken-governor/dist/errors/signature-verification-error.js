import { GovernorError } from './governor-error.js';
export class SignatureVerificationError extends GovernorError {
    requestId;
    constructor(requestId) {
        super(`Signature verification failed for approval request '${requestId}'`);
        this.requestId = requestId;
        this.name = 'SignatureVerificationError';
        Object.setPrototypeOf(this, SignatureVerificationError.prototype);
    }
}
//# sourceMappingURL=signature-verification-error.js.map