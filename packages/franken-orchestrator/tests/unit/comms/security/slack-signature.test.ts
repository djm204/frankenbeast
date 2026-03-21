import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { slackSignatureMiddleware } from '../../../../src/comms/security/slack-signature.js';
import { createHmac } from 'node:crypto';

describe('slackSignatureMiddleware', () => {
  const secret = 'test-secret';
  const app = new Hono();

  app.use('/slack/*', slackSignatureMiddleware({ signingSecret: secret }));
  app.post('/slack/events', (c) => c.json({ ok: true }));

  it('rejects requests with missing headers', async () => {
    const res = await app.request('/slack/events', {
      method: 'POST',
      body: JSON.stringify({ type: 'url_verification' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with expired timestamps', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const res = await app.request('/slack/events', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp.toString(),
        'X-Slack-Signature': 'v0=any',
      },
      body: JSON.stringify({ type: 'url_verification' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid signatures', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: 'url_verification' });
    const basestring = `v0:${timestamp}:${body}`;
    const signature = 'v0=' + createHmac('sha256', secret).update(basestring).digest('hex');

    const res = await app.request('/slack/events', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': signature,
      },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid signatures', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await app.request('/slack/events', {
      method: 'POST',
      headers: {
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Signature': 'v0=invalid',
      },
      body: JSON.stringify({ type: 'url_verification' }),
    });
    expect(res.status).toBe(401);
  });
});
