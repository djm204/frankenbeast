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
});
