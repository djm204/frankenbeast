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

  it('renders provider context block when provider metadata present', async () => {
    const adapter = new SlackAdapter({ token: 'xoxb-test' });
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
    const adapter = new SlackAdapter({ token: 'xoxb-test' });
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
    const adapter = new SlackAdapter({ token: 'xoxb-test' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);

    await adapter.send('session-123', {
      text: 'result',
      metadata: { channelId: 'C1' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as { blocks: Array<{ type: string }> };
    expect(body.blocks.find((b) => b.type === 'context')).toBeUndefined();
  });
});
