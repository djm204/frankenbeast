import type { ApprovalRequest, ApprovalResponse, ApprovalOutcome } from '../core/types.js';
import type { GovernorConfig } from '../core/config.js';
import type { ApprovalChannel } from './approval-channel.js';
import {
  formatApprovalResponseSignaturePayload,
  SignatureVerifier,
} from '../security/signature-verifier.js';
import type { SessionTokenStore } from '../security/session-token-store.js';
import { createSessionToken } from '../security/session-token.js';
import {
  ApprovalTimeoutError,
  SignatureVerificationError,
  ApprovalMismatchError,
  ApprovalConfigurationError,
} from '../errors/index.js';

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
    this.signatureVerifier = deps.signatureVerifier
      ?? (deps.config.signingSecret ? new SignatureVerifier(deps.config.signingSecret) : undefined);
    this.sessionTokenStore = deps.sessionTokenStore;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
    if (this.config.requireSignedApprovals && !this.signatureVerifier) {
      throw new ApprovalConfigurationError(
        'Signed approvals are required but no signature verifier is configured. Provide config.signingSecret or ApprovalGatewayDeps.signatureVerifier.',
      );
    }

    const response = await this.withTimeout(
      this.channel.requestApproval(request),
      request.requestId,
    );

    // Bind the response to the active request: a stale, replayed, or misrouted
    // response for a different request must never resolve this one, even if it is
    // validly signed for its own requestId.
    if (response.requestId !== request.requestId) {
      throw new ApprovalMismatchError(request.requestId, response.requestId);
    }

    if (this.config.requireSignedApprovals) {
      this.verifySignature(response);
    }

    await this.auditRecorder.record(request, response);

    return this.toOutcome(request, response);
  }

  private verifySignature(response: ApprovalResponse): void {
    const signatureVerifier = this.signatureVerifier;
    const payload = formatApprovalResponseSignaturePayload({
      requestId: response.requestId,
      decision: response.decision,
    });

    if (!signatureVerifier || !response.signature || !signatureVerifier.verify(payload, response.signature)) {
      throw new SignatureVerificationError(response.requestId);
    }
  }

  private async withTimeout(
    promise: Promise<ApprovalResponse>,
    requestId: string,
  ): Promise<ApprovalResponse> {
    return new Promise<ApprovalResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Give the channel a chance to release any waiter state for this
        // request now that nothing is awaiting it anymore (see issue #411).
        this.channel.cancel?.(requestId);
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
          ? this.createAndStoreToken(request, response, this.sessionTokenStore)
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

  private createAndStoreToken(
    request: ApprovalRequest,
    response: ApprovalResponse,
    sessionTokenStore: SessionTokenStore,
  ) {
    const token = createSessionToken({
      approvalId: request.requestId,
      scope: request.skillId ?? request.taskId,
      grantedBy: response.respondedBy,
      ttlMs: this.config.sessionTokenTtlMs,
    });
    sessionTokenStore.store(token);
    return token;
  }
}
