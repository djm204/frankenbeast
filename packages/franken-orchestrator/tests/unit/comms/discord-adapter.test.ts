import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordAdapter } from '../../../src/comms/channels/discord/discord-adapter.js';

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
});
