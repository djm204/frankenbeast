import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppAdapter } from '../../../src/comms/channels/whatsapp/whatsapp-adapter.js';

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
    } as Response);

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
    mockFetch.mockResolvedValue({ ok: true } as Response);

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

  it.each([
    {
      name: 'text',
      message: { text: 'hello whatsapp', status: 'reply' as const },
    },
    {
      name: 'interactive',
      message: {
        text: 'Approve?',
        status: 'approval' as const,
        actions: [{ id: 'approve', label: 'Approve' }],
      },
    },
  ])('rejects $name messages without recipient metadata before calling WhatsApp', async ({ message }) => {
    const mockFetch = vi.fn<typeof fetch>();
    const adapter = new WhatsAppAdapter({
      accessToken: 'token',
      phoneNumberId: '123',
      fetchImpl: mockFetch,
    });

    await expect(adapter.send('session-123', message)).rejects.toThrow(
      'WhatsApp routing error: missing recipient phoneNumber metadata',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('omits raw WhatsApp error bodies while preserving status and provider code', async () => {
    const adapter = new WhatsAppAdapter({
      accessToken: 'token',
      phoneNumberId: '123',
    });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 190,
        message: 'private request data',
      },
    }), {
      status: 401,
      statusText: 'Unauthorized',
    }));

    const error = await adapter.send('session-123', {
      text: 'hello whatsapp',
      status: 'reply',
      metadata: { phoneNumber: '123456789' },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'WhatsApp API error: 401 Unauthorized for https://graph.facebook.com/v21.0/123/messages (provider code: 190)',
    );
    expect((error as Error).message).not.toContain('private request data');
  });

  it('times out a never-resolving outbound request with a redacted error', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const adapter = new WhatsAppAdapter({
      accessToken: 'access-token',
      phoneNumberId: '123',
      fetchImpl: mockFetch,
      timeoutMs: 25,
    });

    const sendPromise = adapter.send('session-123', {
      text: 'hello',
      metadata: { phoneNumber: '123456789' },
    });
    const outcomePromise = sendPromise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await outcomePromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('WhatsApp outbound request timed out after 25ms');
    expect((error as { code?: string }).code).toBe('OUTBOUND_COMMS_TIMEOUT');
    expect((error as Error).message).not.toContain('access-token');
    expect(mockFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    vi.useRealTimers();
  });
});
