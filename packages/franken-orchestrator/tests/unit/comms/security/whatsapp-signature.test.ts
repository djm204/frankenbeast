import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { whatsappSignatureMiddleware } from '../../../../src/comms/security/whatsapp-signature.js';

describe('whatsappSignatureMiddleware', () => {
  it('verifies signatures against the exact UTF-8 request bytes', async () => {
    const appSecret = 'whatsapp-test-secret';
    const localApp = new Hono();
    localApp.use('/whatsapp/*', whatsappSignatureMiddleware({ appSecret }));
    localApp.post('/whatsapp/webhook', (c) => c.json({ ok: true }));

    const body = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify({ text: 'Olá, 世界 👋' }), 'utf8'),
    ]);
    const signature = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;

    const res = await localApp.request('/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Hub-Signature-256': signature,
      },
      body,
    });

    expect(res.status).toBe(200);
  });
});
