import type { ApprovalRequest, ApprovalResponse, ApprovalOutcome } from '../core/types.js';
import type { GovernorConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import type { SignatureVerifier } from '../security/signature-verifier.js';
import type { SessionTokenStore } from '../security/session-token-store.js';
export interface AuditRecorder {
    record(request: ApprovalRequest, response: ApprovalResponse): Promise<void>;
}
export interface ApprovalGatewayDeps {
    readonly channel: ApprovalChannel;
    readonly auditRecorder: AuditRecorder;
    readonly config: GovernorConfig;
    readonly signatureVerifier?: SignatureVerifier;
    readonly sessionTokenStore?: SessionTokenStore;
}
export declare class ApprovalGateway {
    private readonly channel;
    private readonly auditRecorder;
    private readonly config;
    private readonly signatureVerifier;
    private readonly sessionTokenStore;
    constructor(deps: ApprovalGatewayDeps);
    requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>;
    private verifySignature;
    private withTimeout;
    private toOutcome;
    private createAndStoreToken;
}
//# sourceMappingURL=approval-gateway.d.ts.map