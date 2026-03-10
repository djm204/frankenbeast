import { describe, it, expect, vi } from 'vitest';
import { GovernorCritiqueAdapter } from '../../../src/governor/gateway/governor-critique-adapter.js';
import { GovernorAuditRecorder } from '../../../src/governor/audit/audit-recorder.js';
import { BudgetTrigger } from '../../../src/governor/triggers/budget-trigger.js';
import { SkillTrigger } from '../../../src/governor/triggers/skill-trigger.js';
import type { ApprovalChannel } from '../../../src/governor/gateway/approval-channel.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../src/governor/core/types.js';
import type { GovernorMemoryPort, EpisodicTraceRecord } from '../../../src/governor/audit/governor-memory-port.js';

function makeFakeMemoryPort(): GovernorMemoryPort & { traces: EpisodicTraceRecord[] } {
  const traces: EpisodicTraceRecord[] = [];
  return {
    traces,
    recordDecision: vi.fn(async (trace: EpisodicTraceRecord) => { traces.push(trace); }),
  };
}

function makeFakeChannel(decision: ApprovalResponse['decision'], feedback?: string): ApprovalChannel {
  return {
    channelId: 'fake',
    requestApproval: vi.fn<[ApprovalRequest], Promise<ApprovalResponse>>().mockResolvedValue({
      requestId: 'req-001',
      decision,
      feedback,
      respondedBy: 'human',
      respondedAt: new Date(),
    }),
  };
}

function makeRationale(taskId: string = 'task-001') {
  return {
    taskId,
    reasoning: 'Deploy v2.0 to production',
    selectedTool: 'deploy-prod',
    expectedOutcome: 'Successful deployment',
    timestamp: new Date(),
  };
}

describe('Full Approval Flow (integration)', () => {
  it('budget trigger → APPROVE → audit trace recorded with hitl:approved', async () => {
    const memoryPort = makeFakeMemoryPort();
    const auditRecorder = new GovernorAuditRecorder(memoryPort);
    const budgetTrigger = new BudgetTrigger();

    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('APPROVE'),
      auditRecorder,
      evaluators: [{
        triggerId: 'budget',
        evaluate: () => ({
          triggered: true,
          triggerId: 'budget',
          reason: 'Spent $1.50 over $1.00 limit',
          severity: 'critical' as const,
        }),
      }],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());

    expect(result).toEqual({ verdict: 'approved' });
    expect(memoryPort.traces).toHaveLength(1);
    expect(memoryPort.traces[0]!.status).toBe('success');
    expect(memoryPort.traces[0]!.tags).toContain('hitl:approved');
    expect(memoryPort.traces[0]!.tags).toContain('hitl:preferred-pattern');
  });

  it('skill trigger → REGEN → audit trace with rejection reason', async () => {
    const memoryPort = makeFakeMemoryPort();
    const auditRecorder = new GovernorAuditRecorder(memoryPort);

    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('REGEN', 'Use canary deployment instead'),
      auditRecorder,
      evaluators: [{
        triggerId: 'skill',
        evaluate: () => ({
          triggered: true,
          triggerId: 'skill',
          reason: 'Skill deploy-prod requires HITL',
          severity: 'high' as const,
        }),
      }],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());

    expect(result.verdict).toBe('rejected');
    if (result.verdict === 'rejected') {
      expect(result.reason).toBe('Use canary deployment instead');
    }
    expect(memoryPort.traces).toHaveLength(1);
    expect(memoryPort.traces[0]!.status).toBe('failure');
    expect(memoryPort.traces[0]!.tags).toContain('hitl:rejected');
    expect(memoryPort.traces[0]!.tags).toContain('hitl:rejection-reason');
  });

  it('no trigger → approved without calling channel', async () => {
    const memoryPort = makeFakeMemoryPort();
    const auditRecorder = new GovernorAuditRecorder(memoryPort);
    const channel = makeFakeChannel('APPROVE');

    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder,
      evaluators: [{
        triggerId: 'none',
        evaluate: () => ({ triggered: false, triggerId: 'none' }),
      }],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());

    expect(result).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
    expect(memoryPort.traces).toHaveLength(0);
  });

  it('ABORT → rejected with abort message', async () => {
    const memoryPort = makeFakeMemoryPort();
    const auditRecorder = new GovernorAuditRecorder(memoryPort);

    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel('ABORT'),
      auditRecorder,
      evaluators: [{
        triggerId: 'budget',
        evaluate: () => ({
          triggered: true,
          triggerId: 'budget',
          reason: 'Over budget',
          severity: 'critical' as const,
        }),
      }],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());

    expect(result.verdict).toBe('rejected');
    if (result.verdict === 'rejected') {
      expect(result.reason).toContain('Aborted');
    }
    expect(memoryPort.traces[0]!.tags).toContain('hitl:aborted');
  });
});
