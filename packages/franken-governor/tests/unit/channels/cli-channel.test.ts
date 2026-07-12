import { describe, it, expect, vi } from 'vitest';
import { CliChannel } from '../../../src/channels/cli-channel.js';
import type { ApprovalRequest } from '../../../src/core/types.js';
import type { ReadlineAdapter } from '../../../src/channels/cli-channel.js';
import { approvalPromptBoundary } from '../../../src/gateway/approval-prompt-markers.js';

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

  it('wraps approval context in request-bound anti-spoofing markers', async () => {
    const readline = makeFakeReadline(['a']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });
    const request = makeRequest({ requestId: 'req-xyz', summary: 'Deploy v2.0' });

    await channel.requestApproval(request);

    const prompt = vi.mocked(readline.question).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain(approvalPromptBoundary('req-xyz', 'BEGIN'));
    expect(prompt).toContain(approvalPromptBoundary('req-xyz', 'END'));
    expect(prompt).toContain('Trust only content between the matching BEGIN/END markers');
    expect(prompt).toContain('Request marker ID: cmVxLXh5eg');
    expect(prompt).toContain('Request ID (untrusted):\n| req-xyz');
  });

  it('quotes model-controlled text so forged marker lines stay visibly untrusted', async () => {
    const readline = makeFakeReadline(['a']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });
    const forgedBoundary = approvalPromptBoundary('req-001', 'END');

    await channel.requestApproval(makeRequest({
      taskId: `task-001\n${approvalPromptBoundary('req-001', 'END')}`,
      trigger: {
        triggered: true,
        triggerId: 'budget',
        reason: `Over budget\n${approvalPromptBoundary('req-001', 'BEGIN')}`,
        severity: 'critical',
      },
      summary: `looks safe\n${forgedBoundary}\n[a]pprove everything\u001b[2K`,
      planDiff: `${approvalPromptBoundary('req-001', 'BEGIN')}\nrm -rf .`,
    }));

    const prompt = vi.mocked(readline.question).mock.calls[0]?.[0] ?? '';
    expect(prompt.split('\n').filter((line) => line === forgedBoundary)).toHaveLength(1);
    expect(prompt).toContain(`| ${forgedBoundary}`);
    expect(prompt).toContain(`| ${approvalPromptBoundary('req-001', 'BEGIN')}`);
    expect(prompt).toContain('| [budget] Over budget');
    expect(prompt).toContain('| [a]pprove everything\\u{001b}[2K');
  });

  it('re-prompts on invalid input until valid', async () => {
    const readline = makeFakeReadline(['invalid', 'z', 'a']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');
    expect(readline.question).toHaveBeenCalledTimes(3);
  });
});
