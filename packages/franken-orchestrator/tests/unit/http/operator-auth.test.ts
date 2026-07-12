import { describe, expect, it } from 'vitest';
import { Hono, type Context } from 'hono';
import { extractOperatorTokenCookie, isCookieOperatorAuthAllowed, requireOperatorAuth } from '../../../src/http/operator-auth.js';
import { errorHandler } from '../../../src/http/middleware.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

describe('operator auth', () => {
  it('extracts the HttpOnly operator-token cookie used by server-side chat sessions', () => {
    expect(extractOperatorTokenCookie('theme=dark; frankenbeast_operator_token=op%3Dsecret; other=1')).toBe('op=secret');
  });

  it('accepts operator auth from cookies without exposing bearer headers to browser code', async () => {
    const app = new Hono();
    app.use('/v1/chat/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.post('/v1/chat/sessions', (c: Context) => c.json({ ok: true }));

    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: {
        cookie: 'frankenbeast_operator_token=op-secret',
        origin: 'http://localhost',
      },
    });

    expect(res.status).toBe(200);
  });

  it('rejects unsafe cross-origin cookie-authenticated operator requests', async () => {
    const app = new Hono();
    app.use('/v1/network/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.onError(errorHandler);
    app.post('/v1/network/up', (c: Context) => c.json({ ok: true }));

    const res = await app.request('/v1/network/up', {
      method: 'POST',
      headers: {
        cookie: 'frankenbeast_operator_token=op-secret',
        origin: 'https://attacker.example',
      },
    });

    expect(res.status).toBe(403);
  });

  it('accepts same-origin cookie-authenticated operator requests', async () => {
    const app = new Hono();
    app.use('/v1/network/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.onError(errorHandler);
    app.post('/v1/network/up', (c: Context) => c.json({ ok: true }));

    const res = await app.request('http://localhost/v1/network/up', {
      method: 'POST',
      headers: {
        cookie: 'frankenbeast_operator_token=op-secret',
        origin: 'http://localhost',
      },
    });

    expect(res.status).toBe(200);
  });

  it('requires both a same-origin Origin header and a safe fetch-site signal for cookie mutations', () => {
    expect(isCookieOperatorAuthAllowed({
      method: 'POST',
      requestUrl: 'http://localhost/v1/network/up',
      origin: 'http://localhost',
      secFetchSite: 'same-origin',
    })).toBe(true);
    expect(isCookieOperatorAuthAllowed({
      method: 'POST',
      requestUrl: 'http://localhost/v1/network/up',
      origin: 'http://localhost',
      secFetchSite: 'cross-site',
    })).toBe(false);
    expect(isCookieOperatorAuthAllowed({
      method: 'POST',
      requestUrl: 'http://localhost/v1/network/up',
      origin: 'http://localhost',
      secFetchSite: 'none',
    })).toBe(false);
    expect(isCookieOperatorAuthAllowed({
      method: 'POST',
      requestUrl: 'http://internal.local/v1/network/up',
      origin: 'https://dashboard.example.com',
      secFetchSite: 'same-origin',
      forwardedProto: 'https',
      forwardedHost: 'dashboard.example.com',
    })).toBe(true);
    expect(isCookieOperatorAuthAllowed({
      method: 'POST',
      requestUrl: 'http://localhost/v1/network/up',
      secFetchSite: 'same-origin',
    })).toBe(false);
  });

  it('still rejects unauthenticated protected chat routes', async () => {
    const app = new Hono();
    app.use('/v1/chat/*', requireOperatorAuth({ operatorToken: 'op-secret', security: new TransportSecurityService() }));
    app.onError(errorHandler);
    app.post('/v1/chat/sessions', (c: Context) => c.json({ ok: true }));

    const res = await app.request('/v1/chat/sessions', { method: 'POST' });

    expect(res.status).toBe(401);
  });
});
