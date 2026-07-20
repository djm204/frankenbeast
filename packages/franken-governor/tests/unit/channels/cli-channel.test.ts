import { describe, it, expect, vi } from 'vitest';
import { CliChannel } from '../../../src/channels/cli-channel.js';
import type { ApprovalRequest } from '../../../src/core/types.js';
import type { ReadlineAdapter } from '../../../src/channels/cli-channel.js';
import {
  approvalPromptBoundary,
  attachTrustedApprovalPromptNotice,
} from '../../../src/gateway/approval-prompt-markers.js';

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
  it('forwards gateway cancellation only to the matching active readline question', async () => {
    let rejectQuestion: ((reason: Error) => void) | undefined;
    const cancel = vi.fn(() => {
      const error = new Error('Terminal question cancelled');
      error.name = 'AbortError';
      rejectQuestion?.(error);
    });
    let answer: ((value: string) => void) | undefined;
    const channel = new CliChannel({
      readline: {
        question: vi.fn(() => new Promise<string>((resolve, reject) => {
          answer = resolve;
          rejectQuestion = reject;
        })),
        cancel,
      },
      operatorName: 'dev',
    });

    const pending = channel.requestApproval(makeRequest({ requestId: 'req-001' }));
    await Promise.resolve();
    channel.cancel('req-other');

    expect(cancel).not.toHaveBeenCalled();

    channel.cancel('req-001');
    expect(cancel).toHaveBeenCalledTimes(1);

    answer?.('a');
    await pending;
  });

  it('serializes approvals and drops a queued request cancelled by its own timeout', async () => {
    const answers: Array<(value: string) => void> = [];
    const question = vi.fn(() => new Promise<string>((resolve) => answers.push(resolve)));
    const cancel = vi.fn();
    const channel = new CliChannel({ readline: { question, cancel }, operatorName: 'dev' });

    const first = channel.requestApproval(makeRequest({ requestId: 'req-first' }));
    const second = channel.requestApproval(makeRequest({ requestId: 'req-second' }));
    await Promise.resolve();

    expect(question).toHaveBeenCalledTimes(1);
    channel.cancel('req-second');
    expect(cancel).not.toHaveBeenCalled();

    answers[0]?.('a');
    await expect(first).resolves.toMatchObject({ requestId: 'req-first' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });

    expect(question).toHaveBeenCalledTimes(1);
  });

  it('implements ApprovalChannel with channelId "cli"', () => {
    const channel = new CliChannel({ readline: makeFakeReadline([]), operatorName: 'dev' });
    expect(channel.channelId).toBe('cli');
  });

  it('maps "a" input to APPROVE response code', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['a']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');
  });

  it('accepts approval acknowledgement tokens as inline feedback', async () => {
    const channel = new CliChannel({
      readline: makeFakeReadline(['a ACK-APPROVAL-ANOMALY-req-001']),
      operatorName: 'dev',
    });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');
    expect(response.feedback).toBe('ACK-APPROVAL-ANOMALY-req-001');
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

  it('accepts "yes" and "y" as APPROVE aliases', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['yes']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('APPROVE');

    const channelWithY = new CliChannel({ readline: makeFakeReadline(['y']), operatorName: 'dev' });
    const responseWithY = await channelWithY.requestApproval(makeRequest({ requestId: 'req-y' }));
    expect(responseWithY.decision).toBe('APPROVE');
  });

  it('accepts "no" and "n" as ABORT aliases', async () => {
    const channel = new CliChannel({ readline: makeFakeReadline(['no']), operatorName: 'dev' });
    const response = await channel.requestApproval(makeRequest());
    expect(response.decision).toBe('ABORT');

    const channelWithN = new CliChannel({ readline: makeFakeReadline(['n']), operatorName: 'dev' });
    const responseWithN = await channelWithN.requestApproval(makeRequest({ requestId: 'req-n' }));
    expect(responseWithN.decision).toBe('ABORT');
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

  it('renders anomaly notices in a trusted prompt section instead of the untrusted summary', async () => {
    const readline = makeFakeReadline(['a']);
    const channel = new CliChannel({ readline, operatorName: 'dev' });

    await channel.requestApproval(attachTrustedApprovalPromptNotice(
      makeRequest({ summary: 'Deploy v2.0' }),
      'Token required: ACK-APPROVAL-ANOMALY-cmVxLTAwMQ',
    ));

    const prompt = vi.mocked(readline.question).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Summary (untrusted):\n| Deploy v2.0');
    expect(prompt).toContain('SECURITY NOTICE (trusted):\n> Token required: ACK-APPROVAL-ANOMALY-cmVxLTAwMQ');
    expect(prompt).not.toContain('| Token required: ACK-APPROVAL-ANOMALY-cmVxLTAwMQ');
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
    expect(readline.question).toHaveBeenCalledWith(
      expect.stringContaining('Please answer a/approve/y/yes, r/regenerate, x/abort/n/no, or d/debug.'),
    );
  });
});
