import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramAdapter } from '../../../src/comms/channels/telegram/telegram-adapter.js';

describe('TelegramAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends a basic text message', async () => {
    const adapter = new TelegramAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/botbot-token/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"chat_id":"12345"'),
      })
    );
  });

  it('rejects missing chat routing metadata without calling Telegram', async () => {
    const adapter = new TelegramAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
    })).rejects.toThrow('Telegram routing error: missing chatId metadata');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('formats inline keyboards for approvals', async () => {
    const adapter = new TelegramAdapter({ token: 'bot-token' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await adapter.send('session-123', {
      text: 'Approve?',
      status: 'approval',
      actions: [{ id: 'approve', label: 'Approve', style: 'primary' }],
      metadata: { chatId: '12345' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe('Approve');
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('fb:session-123:approve');
  });

  it('redacts bot tokens from Telegram API error messages and rendered outbound URLs', async () => {
    const token = '123456789:AAExampleTelegramBotTokenSecretValue';
    const adapter = new TelegramAdapter({ token });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(`upstream failed for https://api.telegram.org/bot${token}/sendMessage`, {
      status: 500,
    }));

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    })).rejects.toThrow('https://api.telegram.org/bot[REDACTED]/sendMessage');

    mockFetch.mockResolvedValueOnce(new Response(`upstream failed for https://api.telegram.org/bot${token}/sendMessage`, {
      status: 500,
    }));

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    })).rejects.not.toThrow(token);
  });

  it('includes redacted endpoint and response body when Telegram returns HTTP errors', async () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyz';
    const adapter = new TelegramAdapter({ token });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response('{"description":"chat not found"}', {
      status: 400,
      statusText: 'Bad Request',
    }));

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    })).rejects.toThrow(
      'Telegram API error: 400 Bad Request for https://api.telegram.org/bot[REDACTED]/sendMessage: {"description":"chat not found"}',
    );
  });

  it('times out a never-resolving outbound request without exposing the bot token', async () => {
    vi.useFakeTimers();
    const token = '123456789:timeout-secret';
    const mockFetch = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const adapter = new TelegramAdapter({ token, fetchImpl: mockFetch, timeoutMs: 25 });

    const sendPromise = adapter.send('session-123', {
      text: 'hello',
      metadata: { chatId: '12345' },
    });
    const outcomePromise = sendPromise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);

    const error = await outcomePromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Telegram outbound request timed out after 25ms');
    expect((error as { code?: string }).code).toBe('OUTBOUND_COMMS_TIMEOUT');
    expect((error as Error).message).not.toContain(token);
    expect(mockFetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    vi.useRealTimers();
  });
});
