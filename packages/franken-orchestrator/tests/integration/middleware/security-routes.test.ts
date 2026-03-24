import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  createSecurityRoutes,
} from '../../../src/http/routes/security-routes.js';
import {
  resolveSecurityConfig,
  type SecurityConfig,
} from '../../../src/middleware/security-profiles.js';

function createTestApp() {
  let config = resolveSecurityConfig('standard');

  const routes = createSecurityRoutes({
    getSecurityConfig: () => config,
    setSecurityConfig: (update: Partial<SecurityConfig>) => {
      config = { ...config, ...update };
    },
  });

  const app = new Hono();
  app.route('/api/security', routes);
  return app;
}

describe('Security API routes', () => {
  it('GET /api/security returns current config', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBe('standard');
    expect(body.injectionDetection).toBe(true);
    expect(body.piiMasking).toBe(true);
  });

  it('GET /api/security includes isCustomized flag (false by default)', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security');
    const body = await res.json();
    expect(body.isCustomized).toBe(false);
  });

  it('PATCH /api/security with profile switches all defaults', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'permissive' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBe('permissive');
    expect(body.injectionDetection).toBe(false);
    expect(body.piiMasking).toBe(false);
    expect(body.requireApproval).toBe('none');
  });

  it('PATCH /api/security with individual override', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piiMasking: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.piiMasking).toBe(false);
    expect(body.injectionDetection).toBe(true); // unchanged
  });

  it('PATCH /api/security marks isCustomized when settings differ from profile', async () => {
    const app = createTestApp();
    await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piiMasking: false }),
    });
    const res = await app.request('/api/security');
    const body = await res.json();
    expect(body.isCustomized).toBe(true);
  });

  it('PATCH /api/security validates input schema', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'ultra-secure' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('PATCH /api/security rejects strict profile without allowedDomains', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'strict' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('allowedDomains');
  });

  it('PATCH /api/security allows strict profile with allowedDomains', async () => {
    const app = createTestApp();
    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'strict', allowedDomains: ['github.com'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBe('strict');
    expect(body.allowedDomains).toEqual(['github.com']);
  });
});
