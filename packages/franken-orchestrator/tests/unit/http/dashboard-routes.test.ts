import { describe, it, expect, vi } from 'vitest';
import { createDashboardRoutes, type DashboardRouteDeps } from '../../../src/http/routes/dashboard-routes.js';

function createMockDeps(): DashboardRouteDeps {
  return {
    skillManager: {
      listInstalled: vi.fn().mockReturnValue([
        {
          name: 'github',
          enabled: true,
          hasContext: false,
          mcpServerCount: 1,
          installedAt: '2026-01-01T00:00:00Z',
        },
        {
          name: 'slack',
          enabled: false,
          hasContext: true,
          mcpServerCount: 2,
          installedAt: '2026-01-02T00:00:00Z',
        },
      ]),
      getEnabledSkills: vi.fn().mockReturnValue(['github']),
    } as never,
    getSecurityConfig: vi.fn().mockReturnValue({
      profile: 'standard',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
      requireApproval: 'destructive',
    }),
    getProviders: vi.fn().mockReturnValue([
      { name: 'claude', type: 'claude-cli' },
    ]),
  };
}

describe('dashboard routes', () => {
  describe('GET /', () => {
    it('returns aggregated dashboard state', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const res = await app.request('/');

      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body.skills).toHaveLength(2);
      expect(body.security).toEqual({
        profile: 'standard',
        injectionDetection: true,
        piiMasking: true,
        outputValidation: true,
        requireApproval: 'destructive',
      });
      expect(body.providers).toEqual([
        { name: 'claude', type: 'claude-cli' },
      ]);
    });

    it('merges enabled field from getEnabledSkills', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const res = await app.request('/');

      const body = await res.json() as {
        skills: Array<{ name: string; enabled: boolean }>;
      };
      const github = body.skills.find((s) => s.name === 'github');
      const slack = body.skills.find((s) => s.name === 'slack');

      expect(github?.enabled).toBe(true);
      expect(slack?.enabled).toBe(false);
    });

    it('calls all dependency functions', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      await app.request('/');

      expect(deps.skillManager.listInstalled).toHaveBeenCalled();
      expect(deps.skillManager.getEnabledSkills).toHaveBeenCalled();
      expect(deps.getSecurityConfig).toHaveBeenCalled();
      expect(deps.getProviders).toHaveBeenCalled();
    });
  });

  describe('GET /events', () => {
    it('returns SSE content-type', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const res = await app.request('/events');

      expect(res.headers.get('content-type')).toContain('text/event-stream');
    });

    it('sends initial snapshot event in the stream', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const res = await app.request('/events');

      // Read partial stream — the SSE connection stays open, so we read
      // chunks until we have enough data for the initial snapshot.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      // Read up to 10 chunks (snapshot is in the first one)
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.read();
        if (value) text += decoder.decode(value, { stream: true });
        if (done || text.includes('event: snapshot')) break;
      }
      reader.cancel();

      // SSE format: event: snapshot\ndata: ...\n\n
      expect(text).toContain('event: snapshot');

      // Extract the data line for the snapshot event
      const dataLine = text
        .split('\n')
        .find((line) => line.startsWith('data: ') && line.includes('skills'));
      expect(dataLine).toBeDefined();

      const data = JSON.parse(dataLine!.replace('data: ', ''));
      expect(data.skills).toHaveLength(2);
      expect(data.security.profile).toBe('standard');
      expect(data.providers).toHaveLength(1);
    });
  });
});
