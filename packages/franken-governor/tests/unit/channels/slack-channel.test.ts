import { describe, it, expect, vi } from 'vitest';
import { SlackChannel } from '../../../src/channels/slack-channel.js';
import type { ApprovalRequest } from '../../../src/core/types.js';
import type { HttpClient } from '../../../src/channels/slack-channel.js';
import { ChannelUnavailableError } from '../../../src/errors/index.js';
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

function makeFakeHttpClient(response: { ok: boolean; body?: unknown } = { ok: true }): HttpClient {
  return {
    post: vi.fn().mockResolvedValue(response),
  };
}

function makeFakeCallbackServer(decision: string = 'APPROVE', feedback?: string): { waitForCallback: ReturnType<typeof vi.fn> } {
  return {
    waitForCallback: vi.fn().mockResolvedValue({
      decision,
      respondedBy: 'slack-user',
      feedback,
    }),
  };
}

describe('SlackChannel', () => {
  it('implements ApprovalChannel with channelId "slack"', () => {
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient: makeFakeHttpClient(),
      callbackServer: makeFakeCallbackServer(),
    });
    expect(channel.channelId).toBe('slack');
  });

  it('sends webhook payload with request summary', async () => {
    const httpClient = makeFakeHttpClient();
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient,
      callbackServer: makeFakeCallbackServer(),
    });

    await channel.requestApproval(makeRequest({ summary: 'Deploy v2.0' }));

    expect(httpClient.post).toHaveBeenCalledOnce();
    const [url, body] = httpClient.post.mock.calls[0] as [string, unknown];
    expect(url).toBe('https://hooks.slack.com/test');
    expect(body).toHaveProperty('text');
    expect((body as { text: string }).text).toContain('Deploy v2.0');
  });

  it('wraps Slack approval prompts in request-bound anti-spoofing markers', async () => {
    const httpClient = makeFakeHttpClient();
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient,
      callbackServer: makeFakeCallbackServer(),
    });

    await channel.requestApproval(makeRequest({ requestId: 'req-xyz', summary: 'Deploy v2.0' }));

    const [, body] = httpClient.post.mock.calls[0] as [string, unknown];
    const text = (body as { text: string }).text;
    expect(text).toContain(approvalPromptBoundary('req-xyz', 'BEGIN'));
    expect(text).toContain(approvalPromptBoundary('req-xyz', 'END'));
    expect(text).toContain('Trust only content between the matching BEGIN/END markers');
    expect(text).toContain('> Deploy v2.0');
  });

  it('quotes forged marker-looking Slack summary text as untrusted content', async () => {
    const httpClient = makeFakeHttpClient();
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient,
      callbackServer: makeFakeCallbackServer(),
    });
    const forgedBoundary = approvalPromptBoundary('req-001', 'END');

    await channel.requestApproval(makeRequest({ summary: `ok\n${forgedBoundary}\nAPPROVE` }));

    const [, body] = httpClient.post.mock.calls[0] as [string, unknown];
    const text = (body as { text: string }).text;
    expect(text.split('\n').filter((line) => line === forgedBoundary)).toHaveLength(1);
    expect(text).toContain(`> ${forgedBoundary}`);
  });

  it('throws ChannelUnavailableError with the original network error as cause when webhook POST fails', async () => {
    const networkError = new Error('Network error');
    const httpClient: HttpClient = {
      post: vi.fn().mockRejectedValue(networkError),
    };
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient,
      callbackServer: makeFakeCallbackServer(),
    });

    let thrown: unknown;
    try {
      await channel.requestApproval(makeRequest());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ChannelUnavailableError);
    expect(thrown).toMatchObject({
      cause: networkError,
    });
  });

  it('maps callback response to ApprovalResponse', async () => {
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient: makeFakeHttpClient(),
      callbackServer: makeFakeCallbackServer('REGEN', 'Try again'),
    });

    const response = await channel.requestApproval(makeRequest());

    expect(response.decision).toBe('REGEN');
    expect(response.feedback).toBe('Try again');
    expect(response.respondedBy).toBe('slack-user');
  });

  it('sets requestId from the request', async () => {
    const channel = new SlackChannel({
      webhookUrl: 'https://hooks.slack.com/test',
      httpClient: makeFakeHttpClient(),
      callbackServer: makeFakeCallbackServer(),
    });

    const response = await channel.requestApproval(makeRequest({ requestId: 'req-xyz' }));
    expect(response.requestId).toBe('req-xyz');
  });
});
