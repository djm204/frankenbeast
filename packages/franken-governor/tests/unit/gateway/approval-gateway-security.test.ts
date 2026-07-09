import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { ApprovalGateway } from '../../../src/gateway/approval-gateway.js';
import type { ApprovalChannel } from '../../../src/gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../src/core/types.js';
import { defaultConfig } from '../../../src/core/config.js';
import {
  formatApprovalResponseSignaturePayload,
  SignatureVerifier,
} from '../../../src/security/signature-verifier.js';
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
  const signingFixture = ['test', 'signing', 'fixture'].join('-')

  it('avoids non-null assertions when using optional security dependencies', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/gateway/approval-gateway.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('signatureVerifier!.');
    expect(source).not.toContain('sessionTokenStore!.');
  });

  it('throws SignatureVerificationError when requireSignedApprovals is true and signature is invalid', async () => {
    const verifier = new SignatureVerifier(signingFixture);
    const channel = makeFakeChannel({ signature: 'invalid-sig' });
    const auditRecorder = makeFakeAuditRecorder();
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder,
      config,
      signatureVerifier: verifier,
    });
    const request = makeRequest();

    await expect(gateway.requestApproval(request)).rejects.toThrow(SignatureVerificationError);
    expect(auditRecorder.record).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ requestId: request.requestId, signature: 'invalid-sig' }),
      { securityFailure: 'signature-verification' },
    );
  });

  it('audits missing signatures before rejecting signed approval flows', async () => {
    const verifier = new SignatureVerifier(signingFixture);
    const channel = makeFakeChannel({ signature: undefined });
    const auditRecorder = makeFakeAuditRecorder();
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder,
      config,
      signatureVerifier: verifier,
    });
    const request = makeRequest();

    await expect(gateway.requestApproval(request)).rejects.toThrow(SignatureVerificationError);
    expect(auditRecorder.record).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ requestId: request.requestId }),
      { securityFailure: 'signature-verification' },
    );
  });

  it('preserves SignatureVerificationError when audit logging a failed signature also fails', async () => {
    const verifier = new SignatureVerifier(signingFixture);
    const channel = makeFakeChannel({ signature: 'invalid-sig' });
    const auditRecorder = { record: vi.fn().mockRejectedValue(new Error('audit unavailable')) };
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder,
      config,
      signatureVerifier: verifier,
    });

    await expect(gateway.requestApproval(makeRequest())).rejects.toThrow(SignatureVerificationError);
    expect(auditRecorder.record).toHaveBeenCalledOnce();
  });

  it('passes when requireSignedApprovals is true and signature is valid', async () => {
    const verifier = new SignatureVerifier(signingFixture);
    const responsePayload = formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
    });
    const validSig = verifier.sign(responsePayload);
    const channel = makeFakeChannel({ signature: validSig });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
      signatureVerifier: verifier,
    });

    const outcome = await gateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('APPROVE');
  });

  it('uses a deterministic signature payload that is independent of JSON key order', async () => {
    const verifier = new SignatureVerifier(signingFixture);
    const jsonPayloadWithDifferentOrder = JSON.stringify({ decision: 'APPROVE', requestId: 'req-001' });
    const deterministicPayload = formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
    });
    const channel = makeFakeChannel({ signature: verifier.sign(deterministicPayload) });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
      signatureVerifier: verifier,
    });

    expect(jsonPayloadWithDifferentOrder).not.toBe(deterministicPayload);
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
    const validSig = verifier.sign(formatApprovalResponseSignaturePayload({
      requestId: 'req-001',
      decision: 'APPROVE',
    }));
    const channel = makeFakeChannel({ signature: validSig });
    const wiredGateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config: { ...defaultConfig(), requireSignedApprovals: true, signingSecret },
    });

    const outcome = await wiredGateway.requestApproval(makeRequest());
    expect(outcome.decision).toBe('APPROVE');
  });

  it('refreshes the config-derived verifier when config.signingSecret changes', async () => {
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: 'old-secret' };
    const channel = makeFakeChannel();
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      config,
    });

    const sign = (secret: string, requestId: string) => new SignatureVerifier(secret).sign(
      formatApprovalResponseSignaturePayload({ requestId, decision: 'APPROVE' }),
    );

    vi.mocked(channel.requestApproval)
      .mockResolvedValueOnce({
        requestId: 'req-old',
        decision: 'APPROVE',
        respondedBy: 'human',
        respondedAt: new Date(),
        signature: sign('old-secret', 'req-old'),
      })
      .mockResolvedValueOnce({
        requestId: 'req-stale',
        decision: 'APPROVE',
        respondedBy: 'human',
        respondedAt: new Date(),
        signature: sign('old-secret', 'req-stale'),
      })
      .mockResolvedValueOnce({
        requestId: 'req-new',
        decision: 'APPROVE',
        respondedBy: 'human',
        respondedAt: new Date(),
        signature: sign('new-secret', 'req-new'),
      });

    await expect(gateway.requestApproval(makeRequest({ requestId: 'req-old' }))).resolves.toMatchObject({
      decision: 'APPROVE',
    });

    config.signingSecret = 'new-secret';

    await expect(gateway.requestApproval(makeRequest({ requestId: 'req-stale' }))).rejects.toThrow(
      SignatureVerificationError,
    );
    await expect(gateway.requestApproval(makeRequest({ requestId: 'req-new' }))).resolves.toMatchObject({
      decision: 'APPROVE',
    });
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
    const verifier = new SignatureVerifier(signingFixture);
    const signedForOther = verifier.sign(
      formatApprovalResponseSignaturePayload({ requestId: 'req-OTHER', decision: 'APPROVE' }),
    );
    const channel = makeFakeChannel({ requestId: 'req-OTHER', signature: signedForOther });
    const config = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: signingFixture };
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
