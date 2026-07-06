import { describe, expect, it, vi } from 'vitest';
import { BudgetTrigger } from '../../../src/triggers/budget-trigger.js';
import { SkillTrigger } from '../../../src/triggers/skill-trigger.js';
import { createGovernor } from '../../../src/gateway/governor-factory.js';
import type { ReadlineAdapter } from '../../../src/channels/cli-channel.js';
import type { EpisodicTraceRecord, GovernorMemoryPort } from '../../../src/audit/governor-memory-port.js';
import type { RationaleBlock } from '@franken/types';

function makeRationale(overrides: Partial<RationaleBlock> = {}): RationaleBlock {
  return {
    taskId: 'task-645',
    reasoning: 'Deploy because staging checks passed',
    selectedTool: 'deploy-prod',
    expectedOutcome: 'Production deployment succeeds',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeReadline(inputs: string[]): ReadlineAdapter {
  let index = 0;
  return {
    question: vi.fn(async () => inputs[index++] ?? ''),
  };
}

function makeMemoryPort(): GovernorMemoryPort & { records: EpisodicTraceRecord[] } {
  const records: EpisodicTraceRecord[] = [];
  return {
    records,
    recordDecision: vi.fn(async (trace: EpisodicTraceRecord) => {
      records.push(trace);
    }),
  };
}

describe('createGovernor', () => {
  it('wires readline, memory audit recording, config, and project id into a GovernorCritiqueAdapter', async () => {
    const readline = makeReadline(['a']);
    const memoryPort = makeMemoryPort();
    const governor = createGovernor({
      readline,
      memoryPort,
      projectId: 'proj-645',
      config: { operatorName: 'config-operator' },
      evaluators: [new BudgetTrigger()],
      budgetState: { getBudgetState: () => ({ tripped: true, limitUsd: 10, spendUsd: 11 }) },
    });

    const result = await governor.verifyRationale(makeRationale());

    expect(result).toEqual({ verdict: 'approved' });
    expect(readline.question).toHaveBeenCalledOnce();
    expect(memoryPort.recordDecision).toHaveBeenCalledOnce();
    expect(memoryPort.records[0]).toMatchObject({
      projectId: 'proj-645',
      taskId: 'task-645',
      status: 'success',
      output: {
        decision: 'APPROVE',
        respondedBy: 'config-operator',
      },
      input: {
        triggerId: 'budget',
        triggerSeverity: 'critical',
      },
    });
  });

  it('applies config overrides over defaults', async () => {
    const readline = makeReadline(['a']);
    const memoryPort = makeMemoryPort();
    const governor = createGovernor({
      readline,
      memoryPort,
      config: { requireSignedApprovals: true },
      evaluators: [new BudgetTrigger()],
      budgetState: { getBudgetState: () => ({ tripped: true, limitUsd: 10, spendUsd: 11 }) },
    });

    await expect(governor.verifyRationale(makeRationale())).rejects.toThrow(
      'Signed approvals are required but no signature verifier is configured',
    );
    expect(readline.question).not.toHaveBeenCalled();
    expect(memoryPort.recordDecision).not.toHaveBeenCalled();
  });

  it('prefers explicit operatorName and forwards optional skill metadata sources', async () => {
    const memoryPort = makeMemoryPort();
    const governor = createGovernor({
      readline: makeReadline(['x']),
      memoryPort,
      operatorName: 'explicit-operator',
      config: { operatorName: 'config-operator' },
      evaluators: [new SkillTrigger()],
      skillMetadata: {
        getSkillMetadata: (skillId) => ({
          requiresHitl: skillId === 'deploy-prod',
          isDestructive: false,
        }),
      },
    });

    const result = await governor.verifyRationale(makeRationale());

    expect(result.verdict).toBe('rejected');
    expect(memoryPort.records[0]).toMatchObject({
      projectId: 'default',
      status: 'failure',
      output: {
        decision: 'ABORT',
        respondedBy: 'explicit-operator',
      },
      input: {
        triggerId: 'skill',
        triggerReason: expect.stringContaining('deploy-prod'),
      },
    });
  });

  it('uses an empty evaluator list by default without prompting or auditing', async () => {
    const readline = makeReadline(['x']);
    const memoryPort = makeMemoryPort();
    const governor = createGovernor({ readline, memoryPort });

    const result = await governor.verifyRationale(makeRationale());

    expect(result).toEqual({ verdict: 'approved' });
    expect(readline.question).not.toHaveBeenCalled();
    expect(memoryPort.recordDecision).not.toHaveBeenCalled();
  });
});
