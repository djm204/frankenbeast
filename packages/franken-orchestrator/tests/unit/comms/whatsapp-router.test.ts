import { beforeEach, describe, it, expect, vi } from 'vitest';
import { whatsappRouter } from '../../../src/comms/channels/whatsapp/whatsapp-router.js';
import { createHmac } from 'node:crypto';
import type { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { SessionMapper } from '../../../src/comms/core/session-mapper.js';
import { testCredential } from '../../support/test-credentials.js';

describe('whatsappRouter', () => {
  const appSecret = ['test', 'app', 'fixture'].join('-');
  const verifyToken = testCredential('TEST_WHATSAPP_VERIFY_TOKEN');
  const gateway = {
    handleInbound: vi.fn().mockResolvedValue(undefined),
    handleAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatGateway;
  const sessionMapper = {
    mapToSessionId: vi.fn().mockReturnValue('session-123'),
  } as unknown as SessionMapper;

  const app = whatsappRouter({
    gateway,
    sessionMapper,
    appSecret,
    verifyToken,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getSignature(body: string) {
    const hmac = createHmac('sha256', appSecret);
    hmac.update(body);
    return `sha256=${hmac.digest('hex')}`;
  }

  it('handles verification challenge', async () => {
    const res = await app.request(`/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('123');
  });

  it('routes incoming text message to gateway', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: '1',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '123', phone_number_id: '1' },
            messages: [{
              from: '123456',
              id: 'm1',
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: 'text',
              text: { body: 'hello' },
            }],
          },
          field: 'messages',
        }],
      }],
    });
    const signature = getSignature(body);

    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': signature },
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleInbound).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello',
      externalUserId: '123456',
    }));
  });

  it('returns 400 for invalid webhook payloads without invoking handlers', async () => {
    const appWithoutSig = whatsappRouter({
      gateway,
      sessionMapper,
      appSecret,
      verifyToken,
      verifySignature: false,
    });

    const res = await appWithoutSig.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'whatsapp_business_account', entry: 'not-an-array' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
    expect(gateway.handleInbound).not.toHaveBeenCalled();
    expect(gateway.handleAction).not.toHaveBeenCalled();
  });

  it.each(['not-a-number', '123abc', '999999999999999999999999999999'])(
    'returns 400 for invalid message timestamp %s without invoking handlers',
    async (timestamp) => {
      const appWithoutSig = whatsappRouter({
        gateway,
        sessionMapper,
        appSecret,
        verifyToken,
        verifySignature: false,
      });
      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: '1',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123', phone_number_id: '1' },
              messages: [{
                from: '123456',
                id: 'm1',
                timestamp,
                type: 'text',
                text: { body: 'hello' },
              }],
            },
            field: 'messages',
          }],
        }],
      });

      const res = await appWithoutSig.request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
      expect(gateway.handleInbound).not.toHaveBeenCalled();
      expect(gateway.handleAction).not.toHaveBeenCalled();
    },
  );

  it('routes button reply to gateway', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: '1',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '123', phone_number_id: '1' },
            messages: [{
              from: '123456',
              id: 'm1',
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: 'interactive',
              interactive: {
                type: 'button_reply',
                button_reply: { id: 'approve', title: 'Approve' },
              },
            }],
          },
          field: 'messages',
        }],
      }],
    });
    const signature = getSignature(body);

    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': signature },
      body,
    });

    expect(res.status).toBe(200);
    expect(gateway.handleAction).toHaveBeenCalledWith('whatsapp', 'session-123', 'approve', {
      externalChannelId: '123456',
      phoneNumber: '123456',
    });
  });
});
