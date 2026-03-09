import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnRunner } from '../../../src/chat/turn-runner.js';
import type { ExecuteOutcome, PlanOutcome } from '../../../src/chat/types.js';

describe('TurnRunner', () => {
  const mockExecutor = {
    execute: vi.fn().mockResolvedValue({
      status: 'success',
      summary: 'Done',
      filesChanged: ['src/a.ts'],
      testsRun: 3,
      errors: [],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes executor for execute outcomes', async () => {
    const runner = new TurnRunner(mockExecutor);
    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Fix auth bug',
      approvalRequired: false,
    };

    const result = await runner.run(outcome);
    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userInput: expect.stringContaining('Fix auth bug') }),
    );
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Done');
  });

  it('returns pending state for approval-required turns', async () => {
    const runner = new TurnRunner(mockExecutor);
    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Push to main',
      approvalRequired: true,
    };

    const result = await runner.run(outcome);
    expect(result.status).toBe('pending_approval');
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('handles plan outcomes without executing', async () => {
    const runner = new TurnRunner(mockExecutor);
    const outcome: PlanOutcome = {
      kind: 'plan',
      planSummary: 'Add authentication in 3 chunks',
      chunkCount: 3,
    };

    const result = await runner.run(outcome);
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('3 chunks');
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('emits start and complete events in order', async () => {
    const runner = new TurnRunner(mockExecutor);
    const events: string[] = [];
    runner.on('event', (e) => events.push(e.type));

    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Fix bug',
      approvalRequired: false,
    };

    await runner.run(outcome);
    expect(events[0]).toBe('start');
    expect(events[events.length - 1]).toBe('complete');
  });
});
