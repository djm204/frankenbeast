import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createSecurityRoutes } from '../../../src/http/routes/security-routes.js';
import { PROFILE_DEFAULTS, type SecurityConfig, resolveSecurityConfig } from '../../../src/middleware/security-profiles.js';

describe('security routes', () => {
  it('returns 400 for malformed JSON payload', async () => {
    let current = { ...PROFILE_DEFAULTS.standard } as SecurityConfig;

    const app = new Hono();
    app.route('/api/security', createSecurityRoutes({
      getSecurityConfig: () => current,
      setSecurityConfig: (config) => {
        current = { ...current, ...config };
      },
    }));

    const res = await app.request('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(current).toEqual(resolveSecurityConfig(current.profile));
  });
});
