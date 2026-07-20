import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DiscordAdapter,
  DiscordRoutingError,
} from '../../../src/comms/channels/discord/discord-adapter.js';

describe('DiscordAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends a basic message', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123' }),
    } as Response);

    await adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata: { channelId: 'C1' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/C1/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bot bot-token',
        }),
        body: expect.stringContaining('"content":"hello from discord"'),
      })
    );
  });

  it('sends thread replies to the thread channel', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response);
    const adapter = new DiscordAdapter({ token: 'bot-token', fetchImpl: mockFetch });

    await adapter.send('session-123', {
      text: 'hello thread',
      status: 'reply',
      metadata: { threadId: 'T1' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/T1/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    { name: 'missing metadata', metadata: undefined },
    { name: 'missing route fields', metadata: {} },
    { name: 'non-string channelId', metadata: { channelId: 123 } },
    { name: 'empty channelId', metadata: { channelId: '' } },
    { name: 'whitespace channelId', metadata: { channelId: '   ' } },
    { name: 'non-string threadId', metadata: { threadId: 123 } },
    { name: 'empty threadId', metadata: { threadId: '' } },
    { name: 'whitespace threadId', metadata: { threadId: '   ' } },
  ])('rejects $name before calling Discord', async ({ metadata }) => {
    const mockFetch = vi.fn<typeof fetch>();
    const adapter = new DiscordAdapter({ token: 'bot-token', fetchImpl: mockFetch });

    await expect(adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata,
    })).rejects.toMatchObject({
      name: 'DiscordRoutingError',
      message: 'Discord routing error: missing channelId or threadId metadata',
    } satisfies Partial<DiscordRoutingError>);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('formats buttons and embeds for approval', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await adapter.send('session-123', {
      text: 'Approve this change?',
      status: 'approval',
      actions: [{ id: 'approve', label: 'Approve', style: 'primary' }],
      metadata: { channelId: 'C1' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.embeds[0].description).toBe('Approve this change?');
    expect(body.components[0].type).toBe(1); // Action Row
    expect(body.components[0].components[0].type).toBe(2); // Button
    expect(body.components[0].components[0].label).toBe('Approve');
    expect(body.components[0].components[0].style).toBe(1); // Primary
  });

  it('includes endpoint and response body when Discord rejects a message', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{"message":"rate limited"}', {
      status: 429,
      statusText: 'Too Many Requests',
    }));

    await expect(adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow(
      'Discord API error: 429 Too Many Requests for https://discord.com/api/v10/channels/C1/messages: {"message":"rate limited"}',
    );
  });

  it('redacts echoed auth headers from Discord error bodies by default', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{"Authorization":"Bot bot-token","x-api-key":"proxy-key"}', {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow(
      'Discord API error: 502 Bad Gateway for https://discord.com/api/v10/channels/C1/messages: {"Authorization":"[REDACTED]","x-api-key":"[REDACTED]"}',
    );
  });

  it('redacts unterminated echoed auth fields from Discord error bodies', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{"Authorization":"Bot bot-token', {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow(
      'Discord API error: 502 Bad Gateway for https://discord.com/api/v10/channels/C1/messages: {"Authorization":"[REDACTED]"',
    );
  });

  it('bounds streamed Discord error bodies before formatting diagnostics', async () => {
    const adapter = new DiscordAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(3000)));
      },
    });
    mockFetch.mockResolvedValue(new Response(stream, {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(adapter.send('session-123', {
      text: 'hello from discord',
      status: 'reply',
      metadata: { channelId: 'C1' },
    })).rejects.toThrow(
      `Discord API error: 502 Bad Gateway for https://discord.com/api/v10/channels/C1/messages: ${'x'.repeat(2048)}…`,
    );
  });

  it('times out a never-resolving outbound request with a redacted error', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const adapter = new DiscordAdapter({ token: 'bot-token', fetchImpl: mockFetch, timeoutMs: 25 });

    const sendPromise = adapter.send('session-123', {
      text: 'hello',
      metadata: { channelId: 'C1' },
    });
    const outcomePromise = sendPromise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await outcomePromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Discord outbound request timed out after 25ms');
    expect((error as { code?: string }).code).toBe('OUTBOUND_COMMS_TIMEOUT');
    expect((error as Error).message).not.toContain('bot-token');
    expect(mockFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    vi.useRealTimers();
  });
});
