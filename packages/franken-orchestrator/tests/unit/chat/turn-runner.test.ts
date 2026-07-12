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

    const result = await runner.run(outcome, { sessionId: 'session-1' });
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

    const result = await runner.run(outcome, { sessionId: 'session-1' });
    expect(result.status).toBe('pending_approval');
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('handles plan outcomes without executing', async () => {
    const runner = new TurnRunner(mockExecutor);
    const events: string[] = [];
    runner.on('event', (e) => events.push(e.type));
    const outcome: PlanOutcome = {
      kind: 'plan',
      planSummary: 'Add authentication in 3 chunks',
      chunkCount: 3,
    };

    const result = await runner.run(outcome, { sessionId: 'session-1' });
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('3 chunks');
    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(events).toEqual(['complete']);
    expect(result.events.map((event) => event.type)).toEqual(['complete']);
  });

  it('emits a terminal complete event after approval-required turns', async () => {
    const runner = new TurnRunner(mockExecutor);
    const events: string[] = [];
    runner.on('event', (e) => events.push(e.type));
    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Push to main',
      approvalRequired: true,
    };

    const result = await runner.run(outcome, { sessionId: 'session-1' });

    expect(result.status).toBe('pending_approval');
    expect(events).toEqual(['approval_request', 'complete']);
    expect(result.events.map((event) => event.type)).toEqual(['approval_request', 'complete']);
  });

  it('emits a terminal failure event before executor errors propagate', async () => {
    const erroringExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const runner = new TurnRunner(erroringExecutor);
    const events: Array<{ type: string; data?: unknown }> = [];
    runner.on('event', (event) => events.push(event));
    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Explode',
      approvalRequired: false,
    };

    await expect(runner.run(outcome, { sessionId: 'session-1' })).rejects.toThrow('boom');

    expect(events.map((event) => event.type)).toEqual(['start', 'complete']);
    expect(events[1]?.data).toMatchObject({ status: 'failed' });
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

    await runner.run(outcome, { sessionId: 'session-1' });
    expect(events[0]).toBe('start');
    expect(events[events.length - 1]).toBe('complete');
  });

  it('includes the session id on emitted and returned events', async () => {
    const runner = new TurnRunner(mockExecutor);
    const emitted: Array<{ sessionId: string }> = [];
    runner.on('event', (e) => emitted.push(e));

    const outcome: ExecuteOutcome = {
      kind: 'execute',
      taskDescription: 'Fix bug',
      approvalRequired: false,
    };

    const result = await runner.run(outcome, { sessionId: 'session-abc' });

    expect(emitted.map((event) => event.sessionId)).toEqual(['session-abc', 'session-abc']);
    expect(result.events.map((event) => event.sessionId)).toEqual(['session-abc', 'session-abc']);
  });
});
