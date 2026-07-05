import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { extractOperatorTokenCookie, requireOperatorAuth } from '../../../src/http/operator-auth.js';
import { errorHandler } from '../../../src/http/middleware.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

describe('operator auth', () => {
  it('extracts the HttpOnly operator-token cookie used by server-side chat sessions', () => {
    expect(extractOperatorTokenCookie('theme=dark; frankenbeast_operator_token=op%3Dsecret; other=1')).toBe('op=secret');
  });

  it('accepts operator auth from cookies without exposing bearer headers to browser code', async () => {
    const app = new Hono();
    app.use('/v1/chat/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.post('/v1/chat/sessions', (c) => c.json({ ok: true }));

    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: {
        cookie: 'frankenbeast_operator_token=op-secret',
      },
    });

    expect(res.status).toBe(200);
  });

  it('still rejects unauthenticated protected chat routes', async () => {
    const app = new Hono();
    app.use('/v1/chat/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.onError(errorHandler);
    app.post('/v1/chat/sessions', (c) => c.json({ ok: true }));

    const res = await app.request('/v1/chat/sessions', { method: 'POST' });

    expect(res.status).toBe(401);
  });
});
