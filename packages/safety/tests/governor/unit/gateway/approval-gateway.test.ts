import { describe, it, expect, vi } from 'vitest';
import { ApprovalGateway } from '../../../../src/governor/gateway/approval-gateway.js';
import type { ApprovalChannel } from '../../../../src/governor/gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../../src/governor/core/types.js';
import type { GovernorConfig } from '../../../../src/governor/core/config.js';
import { defaultConfig } from '../../../../src/governor/core/config.js';
import { ApprovalTimeoutError } from '../../../../src/governor/errors/index.js';

function makeApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
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
    requestApproval: vi.fn<[ApprovalRequest], Promise<ApprovalResponse>>().mockResolvedValue({
      requestId: 'req-001',
      decision: 'APPROVE',
      respondedBy: 'human',
      respondedAt: new Date(),
      ...response,
    }),
  };
}

interface FakeAuditRecorder {
  record: ReturnType<typeof vi.fn>;
}

function makeFakeAuditRecorder(): FakeAuditRecorder {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe('ApprovalGateway', () => {
  it('sends ApprovalRequest to the injected channel', async () => {
    const channel = makeFakeChannel();
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config: defaultConfig() });
    const request = makeApprovalRequest();

    await gateway.requestApproval(request);

    expect(channel.requestApproval).toHaveBeenCalledWith(request);
  });

  it('returns APPROVE outcome when channel responds APPROVE', async () => {
    const channel = makeFakeChannel({ decision: 'APPROVE' });
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config: defaultConfig() });

    const outcome = await gateway.requestApproval(makeApprovalRequest());

    expect(outcome.decision).toBe('APPROVE');
  });

  it('returns REGEN outcome with feedback when channel responds REGEN', async () => {
    const channel = makeFakeChannel({ decision: 'REGEN', feedback: 'Try a different approach' });
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config: defaultConfig() });

    const outcome = await gateway.requestApproval(makeApprovalRequest());

    expect(outcome.decision).toBe('REGEN');
    if (outcome.decision === 'REGEN') {
      expect(outcome.feedback).toBe('Try a different approach');
    }
  });

  it('returns ABORT outcome when channel responds ABORT', async () => {
    const channel = makeFakeChannel({ decision: 'ABORT' });
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config: defaultConfig() });

    const outcome = await gateway.requestApproval(makeApprovalRequest());

    expect(outcome.decision).toBe('ABORT');
  });

  it('returns DEBUG outcome when channel responds DEBUG', async () => {
    const channel = makeFakeChannel({ decision: 'DEBUG' });
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config: defaultConfig() });

    const outcome = await gateway.requestApproval(makeApprovalRequest());

    expect(outcome.decision).toBe('DEBUG');
  });

  it('throws ApprovalTimeoutError when channel does not respond within timeoutMs', async () => {
    const channel: ApprovalChannel = {
      channelId: 'slow',
      requestApproval: () => new Promise(() => {}),
    };
    const config: GovernorConfig = { ...defaultConfig(), timeoutMs: 50 };
    const gateway = new ApprovalGateway({ channel, auditRecorder: makeFakeAuditRecorder(), config });

    await expect(gateway.requestApproval(makeApprovalRequest())).rejects.toThrow(ApprovalTimeoutError);
  });

  it('calls auditRecorder.record after receiving response', async () => {
    const auditRecorder = makeFakeAuditRecorder();
    const channel = makeFakeChannel();
    const gateway = new ApprovalGateway({ channel, auditRecorder, config: defaultConfig() });

    await gateway.requestApproval(makeApprovalRequest());

    expect(auditRecorder.record).toHaveBeenCalledOnce();
  });

  it('passes request and response to auditRecorder.record', async () => {
    const auditRecorder = makeFakeAuditRecorder();
    const channel = makeFakeChannel({ decision: 'APPROVE' });
    const gateway = new ApprovalGateway({ channel, auditRecorder, config: defaultConfig() });
    const request = makeApprovalRequest();

    await gateway.requestApproval(request);

    const call = auditRecorder.record.mock.calls[0] as [ApprovalRequest, ApprovalResponse];
    expect(call[0]).toBe(request);
    expect(call[1].decision).toBe('APPROVE');
  });
});
