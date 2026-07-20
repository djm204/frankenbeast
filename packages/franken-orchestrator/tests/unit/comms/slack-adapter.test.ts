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

  it('includes endpoint and response body when Slack returns HTTP errors', async () => {
    const adapter = new SlackAdapter({ token: TEST_SLACK_BOT_TOKEN });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('temporarily unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    }));

    await expect(adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow(
      'Slack API error: 503 Service Unavailable for https://slack.com/api/chat.postMessage: temporarily unavailable',
    );
  });
});
