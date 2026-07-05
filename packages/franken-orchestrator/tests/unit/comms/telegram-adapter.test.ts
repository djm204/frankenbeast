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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => `upstream failed for https://api.telegram.org/bot${token}/sendMessage`,
    } as Response);

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    })).rejects.toThrow('https://api.telegram.org/bot[REDACTED]/sendMessage');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => `upstream failed for https://api.telegram.org/bot${token}/sendMessage`,
    } as Response);

    await expect(adapter.send('session-123', {
      text: 'hello telegram',
      status: 'reply',
      metadata: { chatId: '12345' },
    })).rejects.not.toThrow(token);
  });
});
