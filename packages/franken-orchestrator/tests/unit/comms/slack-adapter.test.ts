import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../../../src/comms/channels/slack/slack-adapter.js';

describe('SlackAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends a message with blocks', async () => {
    const adapter = new SlackAdapter({ token: 'xoxb-test' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await adapter.send('session-123', {
      text: 'hello',
      status: 'reply',
      metadata: { channelId: 'C1' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('chat.postMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"text":"hello"'),
      })
    );
  });

  it('formats buttons correctly in blocks', async () => {
    const adapter = new SlackAdapter({ token: 'xoxb-test' });
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
});
