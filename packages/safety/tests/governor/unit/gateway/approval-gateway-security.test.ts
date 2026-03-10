import { describe, it, expect, vi } from 'vitest';
import { ApprovalGateway } from '../../../../src/governor/gateway/approval-gateway.js';
import type { ApprovalChannel } from '../../../../src/governor/gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../../src/governor/core/types.js';
import { defaultConfig } from '../../../../src/governor/core/config.js';
import { SignatureVerifier } from '../../../../src/governor/security/signature-verifier.js';
import { SessionTokenStore } from '../../../../src/governor/security/session-token-store.js';
import { SignatureVerificationError } from '../../../../src/governor/errors/index.js';

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
  const base: ApprovalResponse = {
    requestId: 'req-001',
    decision: 'APPROVE',
    respondedBy: 'human',
    respondedAt: new Date(),
    ...response,
  };
  return {
    channelId: 'fake',
    requestApproval: vi.fn<[ApprovalRequest], Promise<ApprovalResponse>>().mockResolvedValue(base),
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
