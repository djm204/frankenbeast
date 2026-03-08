import { createSessionToken } from '../security/session-token.js';
import { ApprovalTimeoutError, SignatureVerificationError } from '../errors/index.js';
export class ApprovalGateway {
    channel;
    auditRecorder;
    config;
    signatureVerifier;
    sessionTokenStore;
    constructor(deps) {
        this.channel = deps.channel;
        this.auditRecorder = deps.auditRecorder;
        this.config = deps.config;
        this.signatureVerifier = deps.signatureVerifier;
        this.sessionTokenStore = deps.sessionTokenStore;
    }
    async requestApproval(request) {
        const response = await this.withTimeout(this.channel.requestApproval(request), request.requestId);
        if (this.config.requireSignedApprovals && this.signatureVerifier) {
            this.verifySignature(response);
        }
        await this.auditRecorder.record(request, response);
        return this.toOutcome(request, response);
    }
    verifySignature(response) {
        const payload = JSON.stringify({
            requestId: response.requestId,
            decision: response.decision,
        });
        if (!response.signature || !this.signatureVerifier.verify(payload, response.signature)) {
            throw new SignatureVerificationError(response.requestId);
        }
    }
    async withTimeout(promise, requestId) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new ApprovalTimeoutError(requestId, this.config.timeoutMs));
            }, this.config.timeoutMs);
            promise.then((result) => {
                clearTimeout(timer);
                resolve(result);
            }, (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    toOutcome(request, response) {
        switch (response.decision) {
            case 'APPROVE': {
                const token = this.sessionTokenStore
                    ? this.createAndStoreToken(request, response)
                    : undefined;
                return token !== undefined
                    ? { decision: 'APPROVE', token }
                    : { decision: 'APPROVE' };
            }
            case 'REGEN':
                return { decision: 'REGEN', feedback: response.feedback ?? '' };
            case 'ABORT': {
                const reason = response.feedback;
                return reason !== undefined
                    ? { decision: 'ABORT', reason }
                    : { decision: 'ABORT' };
            }
            case 'DEBUG':
                return { decision: 'DEBUG' };
        }
    }
    createAndStoreToken(request, response) {
        const token = createSessionToken({
            approvalId: request.requestId,
            scope: request.skillId ?? request.taskId,
            grantedBy: response.respondedBy,
            ttlMs: this.config.sessionTokenTtlMs,
        });
        this.sessionTokenStore.store(token);
        return token;
    }
}
//# sourceMappingURL=approval-gateway.js.map