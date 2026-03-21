import { describe, it, expect, vi } from 'vitest';
import { whatsappRouter } from '../../../src/comms/channels/whatsapp/whatsapp-router.js';
import { createHmac } from 'node:crypto';
import type { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { SessionMapper } from '../../../src/comms/core/session-mapper.js';

describe('whatsappRouter', () => {
  const appSecret = 'test-secret';
  const verifyToken = 'test-token';
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

  function getSignature(body: string) {
    const hmac = createHmac('sha256', appSecret);
    hmac.update(body);
    return `sha256=${hmac.digest('hex')}`;
  }

  it('handles verification challenge', async () => {
    const res = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=123');
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
    expect(gateway.handleAction).toHaveBeenCalledWith('whatsapp', 'session-123', 'approve');
  });
});
