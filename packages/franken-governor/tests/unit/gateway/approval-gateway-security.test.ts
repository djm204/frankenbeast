import { describe, it, expect, vi } from 'vitest';
import { ApprovalGateway } from '../../../src/gateway/approval-gateway.js';
import type { ApprovalChannel } from '../../../src/gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../src/core/types.js';
import { defaultConfig } from '../../../src/core/config.js';
import { SignatureVerifier } from '../../../src/security/signature-verifier.js';
import { SessionTokenStore } from '../../../src/security/session-token-store.js';
import {
  SignatureVerificationError,
  ApprovalMismatchError,
  ApprovalConfigurationError,
} from '../../../src/errors/index.js';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-001',
    taskId: 'task-001',
    projectId: 'proj-001',
    trigger: { triggered: true, triggerId: 'budget', reason: 'Over budget', severity: 'high' },
    summary: 'Deploy to production',
    timestamp: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeFakeChannel(response: Partial<ApprovalResponse> = {}): ApprovalChannel {
  return {
    channelId: 'fake',
    // By default a channel echoes the active request's id (a well-behaved
    // responder). Tests can override `response.requestId` to simulate a
    // stale/misrouted response bound to a different request.
    requestApproval: vi
      .fn<[ApprovalRequest], Promise<ApprovalResponse>>()
      .mockImplementation(async (request: ApprovalRequest) => ({
        requestId: request.requestId,
        decision: 'APPROVE',
        respondedBy: 'human',
        respondedAt: new Date(),
        ...response,
      })),
  };
}

function makeFakeAuditRecorder() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe('ApprovalGateway — security integration', () => {
  it('throws SignatureVerificationError when requireSignedApprovals is true and signature is invalid', async () => {
    const verifier = new SignatureVerifier('secret');
    const channel = makeFakeChannel({ signature: 'invalid-sig' });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: 'secret' };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
      signatureVerifier: verifier,
    });

    await expect(gateway.requestApproval(makeRequest())).rejects.toThrow(SignatureVerificationError);
  });

  it('passes when requireSignedApprovals is true and signature is valid', async () => {
    const verifier = new SignatureVerifier('secret');
    const responsePayload = JSON.stringify({ requestId: 'req-001', decision: 'APPROVE' });
    const validSig = verifier.sign(responsePayload);
    const channel = makeFakeChannel({ signature: validSig });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: 'secret' };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
      signatureVerifier: verifier,
    });

    const outcome = await gateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('APPROVE');
  });

  it('skips verification when requireSignedApprovals is false', async () => {
    const channel = makeFakeChannel();
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: defaultConfig(),
    });

    const outcome = await gateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('APPROVE');
  });

  it('returns SessionToken in APPROVE outcome when sessionTokenStore is provided', async () => {
    const tokenStore = new SessionTokenStore();
    const channel = makeFakeChannel({ decision: 'APPROVE' });
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: defaultConfig(),
      sessionTokenStore: tokenStore,
    });

    const outcome = await gateway.requestApproval(makeRequest({ requestId: 'req-tok' }));
    expect(outcome.decision).toBe('APPROVE');
    if (outcome.decision === 'APPROVE') {
      expect(outcome.token).toBeDefined();
      expect(outcome.token!.approvalId).toBe('req-tok');
      expect(tokenStore.isValid(outcome.token!.tokenId)).toBe(true);
    }
  });

  it('rejects with a configuration error before contacting the channel when signed approvals require a verifier but none is configured', async () => {
    const channel = makeFakeChannel();
    const auditRecorder = makeFakeAuditRecorder();
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder,
      config: { ...defaultConfig(), requireSignedApprovals: true },
      // no signatureVerifier and no config.signingSecret
    });

    await expect(gateway.requestApproval(makeRequest())).rejects.toThrow(ApprovalConfigurationError);
    expect(channel.requestApproval).not.toHaveBeenCalled();
    expect(auditRecorder.record).not.toHaveBeenCalled();
  });

  it('constructs a verifier from config.signingSecret and accepts a valid signature', async () => {
    const signingSecret = 'secret-from-config';
    const verifier = new SignatureVerifier(signingSecret);
    const validSig = verifier.sign(JSON.stringify({ requestId: 'req-001', decision: 'APPROVE' }));
    const channel = makeFakeChannel({ signature: validSig });
    const wiredGateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: { ...defaultConfig(), requireSignedApprovals: true, signingSecret },
    });

    const outcome = await wiredGateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('APPROVE');
  });

  it('rejects an unsigned response whose requestId does not match the active request', async () => {
    // Response is for a different (stale/misrouted) request than the one in flight.
    const channel = makeFakeChannel({ requestId: 'req-OTHER', decision: 'APPROVE' });
    const auditRecorder = makeFakeAuditRecorder();
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder,
      config: defaultConfig(),
    });

    await expect(
      gateway.requestApproval(makeRequest({ requestId: 'req-ACTIVE' })),
    ).rejects.toThrow(ApprovalMismatchError);
    // A mismatched response must not be audited.
    expect(auditRecorder.record).not.toHaveBeenCalled();
  });

  it('rejects a validly-signed response whose requestId does not match the active request', async () => {
    // Attacker replays a genuinely-signed approval for request A against active request B.
    const verifier = new SignatureVerifier('secret');
    const signedForOther = verifier.sign(
      JSON.stringify({ requestId: 'req-OTHER', decision: 'APPROVE' }),
    );
    const channel = makeFakeChannel({ requestId: 'req-OTHER', signature: signedForOther });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: 'secret' };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
      signatureVerifier: verifier,
    });

    await expect(
      gateway.requestApproval(makeRequest({ requestId: 'req-ACTIVE' })),
    ).rejects.toThrow(ApprovalMismatchError);
  });

  it('accepts a response whose requestId matches the active request', async () => {
    const channel = makeFakeChannel({ requestId: 'req-ACTIVE', decision: 'APPROVE' });
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: defaultConfig(),
    });

    const outcome = await gateway.requestApproval(makeRequest({ requestId: 'req-ACTIVE' }));
    expect(outcome.decision).toBe('APPROVE');
  });

  it('does not return SessionToken for non-APPROVE decisions', async () => {
    const tokenStore = new SessionTokenStore();
    const channel = makeFakeChannel({ decision: 'REGEN', feedback: 'nope' });
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: defaultConfig(),
      sessionTokenStore: tokenStore,
    });

    const outcome = await gateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('REGEN');
  });
});
