import { describe, it, expect, vi, beforeEach } from 'vitest';
import { telegramRouter } from '../../../src/comms/channels/telegram/telegram-router.js';
import type { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { SessionMapper } from '../../../src/comms/core/session-mapper.js';
import { testCredential } from '../../support/test-credentials.js';

describe('telegramRouter', () => {
  const botToken = testCredential('TEST_TELEGRAM_ROUTER_BOT_TOKEN');
  const gateway = {
    handleInbound: vi.fn().mockResolvedValue(undefined),
    handleAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatGateway;
  const sessionMapper = {
    mapToSessionId: vi.fn().mockReturnValue('session-123'),
  } as unknown as SessionMapper;

  const webhookSecretToken = testCredential('TEST_TELEGRAM_WEBHOOK_SECRET_TOKEN');
  const app = telegramRouter({
    gateway,
    sessionMapper,
    botToken,
    webhookSecretToken,
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
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

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
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

  it('returns 400 for invalid webhook payloads without invoking handlers', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ update_id: 'not-a-number' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
    expect(gateway.handleInbound).not.toHaveBeenCalled();
    expect(gateway.handleAction).not.toHaveBeenCalled();
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

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
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
      webhookSecretToken,
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

    const res = await appWithRealisticToken.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
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

  it('rejects Telegram webhooks without the configured secret_token header', async () => {
    const body = JSON.stringify({
      update_id: 5,
      message: {
        message_id: 100,
        from: { id: 123, first_name: 'User' },
        chat: { id: 456, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'hello franken',
      },
    });

    const missingHeader = await app.request('/', {
      method: 'POST',
      body,
    });
    const wrongHeader = await app.request('/', {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
      },
      body,
    });
    const tokenPath = await app.request(`/${botToken}`, {
      method: 'POST',
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
      body,
    });

    expect(missingHeader.status).toBe(404);
    expect(wrongHeader.status).toBe(404);
    expect(tokenPath.status).toBe(404);
    expect(gateway.handleInbound).not.toHaveBeenCalled();
  });
});
