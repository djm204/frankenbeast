import { describe, it, expect, vi, beforeEach } from 'vitest';
import { telegramRouter } from '../../../src/comms/channels/telegram/telegram-router.js';
import type { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { SessionMapper } from '../../../src/comms/core/session-mapper.js';

describe('telegramRouter', () => {
  const botToken = 'test-token';
  const gateway = {
    handleInbound: vi.fn().mockResolvedValue(undefined),
    handleAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatGateway;
  const sessionMapper = {
    mapToSessionId: vi.fn().mockReturnValue('session-123'),
  } as unknown as SessionMapper;

  const app = telegramRouter({
    gateway,
    sessionMapper,
    botToken,
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('routes incoming message to gateway', async () => {
    const body = JSON.stringify({
      update_id: 1,
      message: {
        message_id: 100,
        from: { id: 123, first_name: 'User' },
        chat: { id: 456, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'hello franken',
      },
    });

    const res = await app.request(`/${botToken}`, {
      method: 'POST',
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleInbound).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello franken',
      externalUserId: '123',
    }));
  });

  it('routes callback query to gateway', async () => {
    const body = JSON.stringify({
      update_id: 2,
      callback_query: {
        id: 'q1',
        from: { id: 123 },
        message: {
          message_id: 100,
          chat: { id: 456 },
        },
        data: 'approve',
      },
    });

    const res = await app.request(`/${botToken}`, {
      method: 'POST',
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleAction).toHaveBeenCalledWith('telegram', 'session-123', 'approve', {
      chatId: '456',
      externalChannelId: '456',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('answerCallbackQuery'),
      expect.any(Object)
    );
  });

  it('uses embedded session ids from callback data when another group operator clicks', async () => {
    const body = JSON.stringify({
      update_id: 3,
      callback_query: {
        id: 'q2',
        from: { id: 999 },
        message: {
          message_id: 101,
          chat: { id: 456 },
        },
        data: 'fb:original-session:approve',
      },
    });

    const res = await app.request(`/${botToken}`, {
      method: 'POST',
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleAction).toHaveBeenCalledWith('telegram', 'original-session', 'approve', {
      chatId: '456',
      externalChannelId: '456',
    });
  });

  it('does not fail callback webhooks when Telegram acknowledgement fails', async () => {
    const token = '123456789:AAExampleTelegramBotTokenSecretValue';
    const appWithRealisticToken = telegramRouter({
      gateway,
      sessionMapper,
      botToken: token,
    });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => `upstream failed for https://api.telegram.org/bot${token}/answerCallbackQuery`,
    } as Response);
    const body = JSON.stringify({
      update_id: 4,
      callback_query: {
        id: 'q3',
        from: { id: 123 },
        message: {
          message_id: 100,
          chat: { id: 456 },
        },
        data: 'approve',
      },
    });

    const res = await appWithRealisticToken.request(`/${token}`, {
      method: 'POST',
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleAction).toHaveBeenCalledWith('telegram', 'session-123', 'approve', {
      chatId: '456',
      externalChannelId: '456',
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('https://api.telegram.org/bot[REDACTED]/answerCallbackQuery'),
    );
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining(token));
  });
});
