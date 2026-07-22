import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../../../src/comms/channels/slack/slack-adapter.js';
import { testCredential } from '../../support/test-credentials.js';

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');

describe('SlackAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('enforces the configured egress policy before sending', async () => {
    const adapter = new SlackAdapter({
      token: TEST_SLACK_BOT_TOKEN,
      egressPolicy: {
        enabled: true,
        lanes: {
          operator: {
            allowedDestinationClasses: ['local'],
            allowedMethods: ['POST'],
          },
        },
      },
    });
    const mockFetch = vi.mocked(fetch);

    await expect(adapter.send('session-123', {
      text: 'blocked',
      status: 'reply',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow('Egress denied for lane operator');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends a message with blocks', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await adapter.send('session-123', {
      text: 'hello',
      status: 'reply',
      metadata: { channelId: ' C1 ', threadTs: '1712345678.000100' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('chat.postMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"text":"hello"'),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as {
      channel: string;
      thread_ts: string;
    };
    expect(body.channel).toBe('C1');
    expect(body.thread_ts).toBe('1712345678.000100');
  });

  it.each([
    { name: 'reply', message: { text: 'hello', status: 'reply' as const } },
    {
      name: 'approval',
      message: {
        text: 'approve?',
        status: 'approval' as const,
        actions: [{ id: 'approve', label: 'Approve' }],
      },
    },
  ])('rejects $name messages without channelId before calling Slack', async ({ message }) => {
    const mockFetch = vi.fn<typeof fetch>();
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN, fetchImpl: mockFetch });

    await expect(adapter.send('session-123', message)).rejects.toThrow(
      'Slack routing error: missing channelId metadata',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, '', '   '])(
    'rejects invalid channelId metadata value %j before calling Slack',
    async (channelId) => {
      const mockFetch = vi.fn<typeof fetch>();
      const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN, fetchImpl: mockFetch });

      await expect(adapter.send('session-123', {
        text: 'hello',
        metadata: { channelId },
      })).rejects.toThrow('Slack routing error: missing channelId metadata');
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it('formats buttons correctly in blocks', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await adapter.send('session-123', {
      text: 'approve?',
      status: 'approval',
      actions: [{ id: 'approve', label: 'Approve', style: 'primary' }],
      metadata: { channelId: 'C1' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string) as { blocks: Array<{ type: string; elements: Array<{ text: { text: string }; style?: string }> }> };
    const actionsBlock = body.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock.elements[0].text.text).toBe('Approve');
    expect(actionsBlock.elements[0].style).toBe('primary');
  });

  it('renders provider context block when provider metadata present', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);

    await adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
      provider: { name: 'claude-cli' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { blocks: Array<{ type: string; elements?: Array<{ text: string }> }> };
    const contextBlock = body.blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(contextBlock!.elements![0]!.text).toContain('claude-cli');
  });

  it('renders failover metadata in context block', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);

    await adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
      provider: { name: 'codex-cli', switchedFrom: 'claude-cli', switchReason: 'rate-limit' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { blocks: Array<{ type: string; elements?: Array<{ text: string }> }> };
    const contextBlock = body.blocks.find((b) => b.type === 'context');
    expect(contextBlock!.elements![0]!.text).toContain('claude-cli → codex-cli');
    expect(contextBlock!.elements![0]!.text).toContain('rate-limit');
  });

  it('omits provider context when not present', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);

    await adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { blocks: Array<{ type: string }> };
    expect(body.blocks.find((b) => b.type === 'context')).toBeUndefined();
  });

  it('omits raw Slack error bodies while preserving status and provider code', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_auth',
      request_echo: 'private request data',
    }), {
      status: 401,
      statusText: 'Unauthorized',
    }));

    const error = await adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Slack API error: 401 Unauthorized for https://slack.com/api/chat.postMessage (provider code: invalid_auth)',
    );
    expect((error as Error).message).not.toContain('private request data');
  });

  it('times out a never-resolving outbound request with a redacted error', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const adapter = new SlackAdapter({
      token: TEST_SLACK_BOT_TOKEN,
      fetchImpl: mockFetch,
      timeoutMs: 25,
    });

    const sendPromise = adapter.send('session-123', {
      text: 'hello',
      metadata: { channelId: 'C1' },
    });
    const outcomePromise = sendPromise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await outcomePromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Slack outbound request timed out after 25ms');
    expect((error as { code?: string }).code).toBe('OUTBOUND_COMMS_TIMEOUT');
    expect((error as Error).message).not.toContain(TEST_SLACK_BOT_TOKEN);
    expect(mockFetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
    expect(mockFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('keeps the outbound deadline active while reading a successful response body', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn<typeof fetch>(async () => ({
      ok: true,
      json: () => new Promise<never>(() => undefined),
    }) as Response);
    const adapter = new SlackAdapter({
      token: TEST_SLACK_BOT_TOKEN,
      fetchImpl: mockFetch,
      timeoutMs: 25,
    });

    const outcomePromise = adapter.send('session-123', {
      text: 'hello',
      metadata: { channelId: 'C1' },
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await outcomePromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Slack outbound request timed out after 25ms');
    expect((error as { code?: string }).code).toBe('OUTBOUND_COMMS_TIMEOUT');
    expect(mockFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    vi.useRealTimers();
  });
});
