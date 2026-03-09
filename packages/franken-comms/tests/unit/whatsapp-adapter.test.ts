import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppAdapter } from '../../src/channels/whatsapp/whatsapp-adapter.js';

describe('WhatsAppAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends a basic text message', async () => {
    const adapter = new WhatsAppAdapter({ 
      accessToken: 'token',
      phoneNumberId: '123'
    });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as any);

    await adapter.send('session-123', {
      text: 'hello whatsapp',
      status: 'reply',
      metadata: { phoneNumber: '123456789' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/123/messages'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"to":"123456789"'),
      })
    );
  });

  it('formats interactive buttons for approvals', async () => {
    const adapter = new WhatsAppAdapter({ 
      accessToken: 'token',
      phoneNumberId: '123'
    });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true } as any);

    await adapter.send('session-123', {
      text: 'Approve?',
      status: 'approval',
      actions: [{ id: 'approve', label: 'Approve' }],
      metadata: { phoneNumber: '123456789' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.interactive.type).toBe('button');
    expect(body.interactive.action.buttons[0].reply.title).toBe('Approve');
  });
});
