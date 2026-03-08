import { describe, it, expect, vi } from 'vitest';
import { GovernorPortAdapter } from '../../../src/adapters/governor-adapter.js';

describe('GovernorPortAdapter', () => {
  it('auto-approves non-HITL tasks', async () => {
    const gateway = { requestApproval: vi.fn() };
    const adapter = new GovernorPortAdapter({
      gateway,
      projectId: 'project-1',
      idFactory: () => 'req-1',
    });

    const result = await adapter.requestApproval({
      taskId: 'task-1',
      summary: 'Do thing',
      requiresHitl: false,
    });

    expect(result).toEqual({ decision: 'approved' });
    expect(gateway.requestApproval).not.toHaveBeenCalled();
  });

  it('routes HITL requests through the gateway when no defaultDecision', async () => {
    const gateway = {
      requestApproval: vi.fn().mockResolvedValue({ decision: 'APPROVE' }),
    };

    const adapter = new GovernorPortAdapter({
      gateway,
      projectId: 'project-1',
      idFactory: () => 'req-2',
    });

    const result = await adapter.requestApproval({
      taskId: 'task-2',
      summary: 'Sensitive task',
      requiresHitl: true,
      skillId: 'skill-1',
    });

    expect(result).toEqual({ decision: 'approved' });
    expect(gateway.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-2',
        taskId: 'task-2',
        projectId: 'project-1',
        summary: 'Sensitive task',
        skillId: 'skill-1',
      }),
    );
  });

  it('defaultDecision=approved auto-approves everything', async () => {
    const gateway = { requestApproval: vi.fn() };
    const adapter = new GovernorPortAdapter({
      gateway,
      projectId: 'project-1',
      defaultDecision: 'approved',
      idFactory: () => 'req-3',
    });

    const result = await adapter.requestApproval({
      taskId: 'task-3',
      summary: 'Sensitive task',
      requiresHitl: true,
    });

    expect(result).toEqual({ decision: 'approved', reason: 'defaultDecision' });
    expect(gateway.requestApproval).not.toHaveBeenCalled();
  });

  it('maps abort decision', async () => {
    const gateway = {
      requestApproval: vi.fn().mockResolvedValue({ decision: 'ABORT', reason: 'stop' }),
    };

    const adapter = new GovernorPortAdapter({
      gateway,
      projectId: 'project-1',
      idFactory: () => 'req-4',
    });

    const result = await adapter.requestApproval({
      taskId: 'task-4',
      summary: 'Abort task',
      requiresHitl: true,
    });

    expect(result).toEqual({ decision: 'abort', reason: 'stop' });
  });

  it('wraps gateway errors', async () => {
    const gateway = {
      requestApproval: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const adapter = new GovernorPortAdapter({
      gateway,
      projectId: 'project-1',
      idFactory: () => 'req-5',
    });

    await expect(
      adapter.requestApproval({ taskId: 'task-5', summary: 'Fail', requiresHitl: true }),
    ).rejects.toThrow('GovernorPortAdapter failed');
  });
});
