import { describe, it, expect, vi } from 'vitest';
import { CliChannel } from '../../../../src/governor/channels/cli-channel.js';
import type { ApprovalRequest } from '../../../../src/governor/core/types.js';
import type { ReadlineAdapter } from '../../../../src/governor/channels/cli-channel.js';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-001',
    taskId: 'task-001',
    projectId: 'proj-001',
    trigger: { triggered: true, triggerId: 'budget', reason: 'Over budget', severity: 'critical' },
    summary: 'Deploy to production',
    timestamp: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeFakeReadline(inputs: string[]): ReadlineAdapter {
  let callIndex = 0;
  return {
    question: vi.fn(async () => {
      const answer = inputs[callIndex] ?? '';
      callIndex++;
      return answer;
    }),
  };
}

describe('CliChannel', () => {
  it('implements ApprovalChannel with channelId "cli"', () => {
    const channel = new CliChannel({ readline: makeFakeReadline([]), operatorName: 'dev' });
    expect(channel.channelId).toBe('cli');
  });

  it('maps "a" input to APPROVE response code', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['a']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');
  });

  it('maps "r" input to REGEN response code', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['r', 'try another way']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('REGEN');
  });

  it('maps "x" input to ABORT response code', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['x']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('ABORT');
  });

  it('maps "d" input to DEBUG response code', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['d']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('DEBUG');
  });

  it('prompts for feedback when REGEN is selected', async () => {
    const readline = makeFakeReadline(['r', 'use a different approach']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('REGEN');
    expect(response.feedback).toBe('use a different approach');
  });

  it('includes respondedBy from operatorName', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['a']), operatorName: 'alice' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.respondedBy).toBe('alice');
  });

  it('sets requestId from the request', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['a']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest({ requestId: 'req-xyz' }));
    expect(response.requestId).toBe('req-xyz');
  });

  it('re-prompts on invalid input until valid', async () => {
    const readline = makeFakeReadline(['invalid', 'z', 'a']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');
    expect(readline.question).toHaveBeenCalledTimes(3);
  });
});
