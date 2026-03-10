import { describe, it, expect, vi } from 'vitest';
import { GovernorCritiqueAdapter } from '../../../../src/governor/gateway/governor-critique-adapter.js';
import type { ApprovalRequest, ApprovalOutcome } from '../../../../src/governor/core/types.js';
import type { ApprovalChannel } from '../../../../src/governor/gateway/approval-channel.js';
import type { TriggerEvaluator } from '../../../../src/governor/triggers/trigger-evaluator.js';
import type { TriggerResult } from '../../../../src/governor/core/types.js';

interface RationaleBlock {
  taskId: string;
  reasoning: string;
  selectedTool?: string;
  expectedOutcome: string;
  timestamp: Date;
}

function makeRationale(overrides: Partial<RationaleBlock> = {}): RationaleBlock {
  return {
    taskId: 'task-001',
    reasoning: 'Deploy because staging tests passed',
    selectedTool: 'deploy-prod',
    expectedOutcome: 'Production deployment succeeds',
    timestamp: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeFakeChannel(decision: ApprovalOutcome['decision'] = 'APPROVE'): ApprovalChannel {
  return {
    channelId: 'fake',
    requestApproval: vi.fn().mockResolvedValue({
      requestId: 'req-001',
      decision,
      feedback: decision === 'REGEN' ? 'Try another approach' : undefined,
      respondedBy: 'human',
      respondedAt: new Date(),
    }),
  };
}

function makeFakeAuditRecorder() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeNonTriggeringEvaluator(): TriggerEvaluator {
  return {
    triggerId: 'none',
    evaluate: () => ({ triggered: false, triggerId: 'none' }),
  };
}

function makeTriggeringEvaluator(): TriggerEvaluator {
  return {
    triggerId: 'budget',
    evaluate: () => ({
      triggered: true,
      triggerId: 'budget',
      reason: 'Budget exceeded',
      severity: 'critical' as const,
    }),
  };
}

describe('GovernorCritiqueAdapter', () => {
  it('returns { verdict: "approved" } when no trigger fires', async () => {
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel(),
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [makeNonTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result).toEqual({ verdict: 'approved' });
  });

  it('sends approval request when trigger fires', async () => {
    const channel = makeFakeChannel();
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [makeTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    await adapter.verifyRationale(makeRationale());
    expect(channel.requestApproval).toHaveBeenCalledOnce();
  });

  it('returns { verdict: "approved" } when human approves', async () => {
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('APPROVE'),
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [makeTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result).toEqual({ verdict: 'approved' });
  });

  it('returns { verdict: "rejected", reason } when human selects REGEN', async () => {
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('REGEN'),
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [makeTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result.verdict).toBe('rejected');
    if (result.verdict === 'rejected') {
      expect(result.reason).toBe('Try another approach');
    }
  });

  it('returns { verdict: "rejected" } when human selects ABORT', async () => {
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('ABORT'),
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [makeTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result.verdict).toBe('rejected');
    if (result.verdict === 'rejected') {
      expect(result.reason).toContain('Aborted');
    }
  });

  it('records audit trail for every decision', async () => {
    const auditRecorder = makeFakeAuditRecorder();
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('APPROVE'),
      auditRecorder,
      evaluators: [makeTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    await adapter.verifyRationale(makeRationale());
    expect(auditRecorder.record).toHaveBeenCalledOnce();
  });

  it('does not call channel or audit when no trigger fires', async () => {
    const channel = makeFakeChannel();
    const auditRecorder = makeFakeAuditRecorder();
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder,
      evaluators: [makeNonTriggeringEvaluator()],
      projectId: 'proj-001',
    });

    await adapter.verifyRationale(makeRationale());
    expect(channel.requestApproval).not.toHaveBeenCalled();
    expect(auditRecorder.record).not.toHaveBeenCalled();
  });
});
