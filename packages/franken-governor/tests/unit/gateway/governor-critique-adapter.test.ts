import { describe, it, expect, vi } from 'vitest';
import { GovernorCritiqueAdapter } from '../../../src/gateway/governor-critique-adapter.js';
import type { SkillMetadataSource } from '../../../src/gateway/governor-critique-adapter.js';
import type { ApprovalRequest, ApprovalOutcome } from '../../../src/core/types.js';
import type { ApprovalChannel } from '../../../src/gateway/approval-channel.js';
import type { TriggerEvaluator } from '../../../src/triggers/trigger-evaluator.js';
import type { TriggerResult } from '../../../src/core/types.js';
import { BudgetTrigger } from '../../../src/triggers/budget-trigger.js';
import { SkillTrigger } from '../../../src/triggers/skill-trigger.js';

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
    requestApproval: vi.fn().mockImplementation(async (request: ApprovalRequest) => ({
      requestId: request.requestId,
      decision,
      feedback: decision === 'REGEN' ? 'Try another approach' : undefined,
      respondedBy: 'human',
      respondedAt: new Date(),
    })),
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

describe('GovernorCritiqueAdapter per-trigger context construction (issue #490)', () => {
  function makeSkillMetadataSource(
    metadata: Record<string, { requiresHitl: boolean; isDestructive: boolean }>,
  ): SkillMetadataSource {
    return { getSkillMetadata: (skillId) => metadata[skillId] };
  }

  it('a destructive skill produces a non-approved verdict through verifyRationale', async () => {
    const channel = makeFakeChannel('REGEN');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new SkillTrigger()],
      projectId: 'proj-001',
      skillMetadata: makeSkillMetadataSource({
        'deploy-prod': { requiresHitl: false, isDestructive: true },
      }),
    });

    const result = await adapter.verifyRationale(makeRationale({ selectedTool: 'deploy-prod' }));

    expect(channel.requestApproval).toHaveBeenCalledOnce();
    expect(result.verdict).toBe('rejected');
    const request = vi.mocked(channel.requestApproval).mock.calls[0]![0] as ApprovalRequest;
    expect(request.trigger.triggerId).toBe('skill');
    expect(request.trigger.severity).toBe('critical');
    expect(request.trigger.reason).toContain('deploy-prod');
  });

  it('a HITL-requiring skill produces a non-approved verdict through verifyRationale', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new SkillTrigger()],
      projectId: 'proj-001',
      skillMetadata: makeSkillMetadataSource({
        'deploy-prod': { requiresHitl: true, isDestructive: false },
      }),
    });

    const result = await adapter.verifyRationale(makeRationale({ selectedTool: 'deploy-prod' }));

    expect(channel.requestApproval).toHaveBeenCalledOnce();
    expect(result.verdict).toBe('rejected');
  });

  it('a benign skill does not fire the SkillTrigger', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new SkillTrigger()],
      projectId: 'proj-001',
      skillMetadata: makeSkillMetadataSource({
        'read-docs': { requiresHitl: false, isDestructive: false },
      }),
    });

    const result = await adapter.verifyRationale(makeRationale({ selectedTool: 'read-docs' }));

    expect(result).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('a tripped budget produces a non-approved verdict through verifyRationale', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new BudgetTrigger()],
      projectId: 'proj-001',
      budgetState: { getBudgetState: () => ({ tripped: true, limitUsd: 50, spendUsd: 52.3 }) },
    });

    const result = await adapter.verifyRationale(makeRationale());

    expect(channel.requestApproval).toHaveBeenCalledOnce();
    expect(result.verdict).toBe('rejected');
    const request = vi.mocked(channel.requestApproval).mock.calls[0]![0] as ApprovalRequest;
    expect(request.trigger.triggerId).toBe('budget');
    expect(request.trigger.severity).toBe('critical');
  });

  it('an untripped budget does not fire the BudgetTrigger', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new BudgetTrigger()],
      projectId: 'proj-001',
      budgetState: { getBudgetState: () => ({ tripped: false, limitUsd: 50, spendUsd: 1 }) },
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('skips a SkillTrigger when no skill metadata source is injected', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new SkillTrigger()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale({ selectedTool: 'deploy-prod' }));
    expect(result).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('skips a SkillTrigger when the rationale has no selectedTool or the skill is unknown', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new SkillTrigger()],
      projectId: 'proj-001',
      skillMetadata: makeSkillMetadataSource({
        'deploy-prod': { requiresHitl: true, isDestructive: true },
      }),
    });

    const noTool = makeRationale();
    delete noTool.selectedTool;
    expect(await adapter.verifyRationale(noTool)).toEqual({ verdict: 'approved' });

    const unknownSkill = await adapter.verifyRationale(makeRationale({ selectedTool: 'unknown-skill' }));
    expect(unknownSkill).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('skips a BudgetTrigger when no budget state source is injected', async () => {
    const channel = makeFakeChannel('ABORT');
    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [new BudgetTrigger()],
      projectId: 'proj-001',
    });

    const result = await adapter.verifyRationale(makeRationale());
    expect(result).toEqual({ verdict: 'approved' });
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('still passes the rationale to custom evaluators', async () => {
    const seen: unknown[] = [];
    const custom: TriggerEvaluator = {
      triggerId: 'custom',
      evaluate: (context) => {
        seen.push(context);
        return { triggered: false, triggerId: 'custom' };
      },
    };
    const adapter = new GovernorCritiqueAdapter({
      channel: makeFakeChannel(),
      auditRecorder: makeFakeAuditRecorder(),
      evaluators: [custom],
      projectId: 'proj-001',
    });

    const rationale = makeRationale();
    await adapter.verifyRationale(rationale);
    expect(seen).toEqual([rationale]);
  });
});
