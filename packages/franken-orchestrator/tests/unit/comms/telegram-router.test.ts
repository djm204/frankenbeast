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
    expect(gateway.handleAction).toHaveBeenCalledWith('telegram', 'session-123', 'approve');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('answerCallbackQuery'),
      expect.any(Object)
    );
  });
});
