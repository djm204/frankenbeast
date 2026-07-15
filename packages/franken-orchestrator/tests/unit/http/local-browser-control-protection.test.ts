import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { errorHandler, localBrowserControlProtection } from '../../../src/http/middleware.js';

function createProtectedApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', localBrowserControlProtection());
  app.get('/api/dashboard', (c) => c.json({ ok: true }));
  app.post('/api/dashboard/events/ticket', (c) => c.json({ ok: true }));
  app.post('/v1/beasts/runs', (c) => c.json({ ok: true }));
  app.post('/webhooks/provider', (c) => c.json({ ok: true }));
  return app;
}

describe('local browser control protection', () => {
  it('sets frame and browser hardening headers on local UI responses', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://localhost:3737/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
  });

  it('allows same-origin browser mutations for local controls', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://localhost:3737/api/dashboard/events/ticket', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3737',
        'sec-fetch-site': 'same-origin',
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies cross-origin browser mutations before local controls run', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://localhost:3737/v1/beasts/runs', {
      method: 'POST',
      headers: {
        origin: 'http://evil.local',
        'sec-fetch-site': 'cross-site',
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Local web control mutations require a same-origin browser request',
    });
  });

  it('does not apply the local control CSRF gate to provider webhook ingress paths', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://localhost:3737/webhooks/provider', {
      method: 'POST',
      headers: {
        origin: 'https://provider.example',
        'sec-fetch-site': 'cross-site',
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows explicitly configured dashboard origins for direct backend deployments', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.use('*', localBrowserControlProtection({ allowedOrigins: ['https://dashboard.example.com'] }));
    app.post('/v1/chat/sessions', (c) => c.json({ ok: true }));

    const res = await app.request('http://127.0.0.1:3737/v1/chat/sessions', {
      method: 'POST',
      headers: {
        origin: 'https://dashboard.example.com',
        'sec-fetch-site': 'cross-site',
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows IPv6 loopback same-origin browser mutations', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://[::1]:3737/v1/beasts/runs', {
      method: 'POST',
      headers: {
        origin: 'http://[::1]:3737',
        'sec-fetch-site': 'same-origin',
      },
    });

    expect(res.status).toBe(200);
  });

  it('rejects same-origin mutations from unconfigured non-local hosts', async () => {
    const app = createProtectedApp();

    const res = await app.request('http://attacker.example/v1/beasts/runs', {
      method: 'POST',
      headers: {
        origin: 'http://attacker.example',
        'sec-fetch-site': 'same-origin',
      },
    });

    expect(res.status).toBe(403);
  });
});
