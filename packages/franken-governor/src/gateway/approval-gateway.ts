import type { ApprovalRequest, ApprovalResponse, ApprovalOutcome } from '../core/types.js';
import type { GovernorConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import type { SignatureVerifier } from '../security/signature-verifier.js';
import type { SessionTokenStore } from '../security/session-token-store.js';
import { createSessionToken } from '../security/session-token.js';
import { ApprovalTimeoutError, SignatureVerificationError } from '../errors/index.js';

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

export class ApprovalGateway {
  private readonly channel: ApprovalChannel;
  private readonly auditRecorder: AuditRecorder;
  private readonly config: GovernorConfig;
  private readonly signatureVerifier: SignatureVerifier | undefined;
  private readonly sessionTokenStore: SessionTokenStore | undefined;

  constructor(deps: ApprovalGatewayDeps) {
    this.channel = deps.channel;
    this.auditRecorder = deps.auditRecorder;
    this.config = deps.config;
    this.signatureVerifier = deps.signatureVerifier;
    this.sessionTokenStore = deps.sessionTokenStore;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
    const response = await this.withTimeout(
      this.channel.requestApproval(request),
      request.requestId,
    );

    if (this.config.requireSignedApprovals && this.signatureVerifier) {
      this.verifySignature(response);
    }

    await this.auditRecorder.record(request, response);

    return this.toOutcome(request, response);
  }

  private verifySignature(response: ApprovalResponse): void {
    const payload = JSON.stringify({
      requestId: response.requestId,
      decision: response.decision,
    });

    if (!response.signature || !this.signatureVerifier!.verify(payload, response.signature)) {
      throw new SignatureVerificationError(response.requestId);
    }
  }

  private async withTimeout(
    promise: Promise<ApprovalResponse>,
    requestId: string,
  ): Promise<ApprovalResponse> {
    return new Promise<ApprovalResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ApprovalTimeoutError(requestId, this.config.timeoutMs));
      }, this.config.timeoutMs);

      promise.then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err as Error);
        },
      );
    });
  }

  private toOutcome(request: ApprovalRequest, response: ApprovalResponse): ApprovalOutcome {
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

  private createAndStoreToken(request: ApprovalRequest, response: ApprovalResponse) {
    const token = createSessionToken({
      approvalId: request.requestId,
      scope: request.skillId ?? request.taskId,
      grantedBy: response.respondedBy,
      ttlMs: this.config.sessionTokenTtlMs,
    });
    this.sessionTokenStore!.store(token);
    return token;
  }
}
