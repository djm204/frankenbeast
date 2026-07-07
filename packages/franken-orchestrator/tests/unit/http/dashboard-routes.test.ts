import { afterEach, describe, it, expect, vi } from 'vitest';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createDashboardRoutes, type DashboardRouteDeps } from '../../../src/http/routes/dashboard-routes.js';

let ticketStore: SseConnectionTicketStore | undefined;

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
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
    ]),
    operatorToken: 'dashboard-token',
    ticketStore: ticketStore = new SseConnectionTicketStore(),
  };
}

describe('dashboard routes', () => {
  afterEach(() => {
    ticketStore?.destroy();
    ticketStore = undefined;
  });

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
        { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
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
    it('POST /events/ticket returns a short-lived stream ticket', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);

      const res = await app.request('/events/ticket', { method: 'POST' });

      expect(res.status).toBe(200);
      const body = await res.json() as { ticket?: string };
      expect(body.ticket).toBeTruthy();
    });

    it('rejects raw streams without a ticket', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);

      const res = await app.request('/events');

      expect(res.status).toBe(401);
    });

    it('preserves unauthenticated local-dev streams when no operator token is configured', async () => {
      const deps = createMockDeps();
      deps.operatorToken = undefined;
      deps.ticketStore = undefined;
      const app = createDashboardRoutes(deps);

      const ticketRes = await app.request('/events/ticket', { method: 'POST' });
      expect(ticketRes.status).toBe(200);
      expect(await ticketRes.json()).toEqual({ ticket: null });

      const res = await app.request('/events');
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      await res.body?.cancel();
    });

    it('returns SSE content-type with a valid ticket', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const ticketRes = await app.request('/events/ticket', { method: 'POST' });
      const { ticket } = await ticketRes.json() as { ticket: string };

      const res = await app.request(`/events?ticket=${ticket}`);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      await res.body?.cancel();
    });

    it('rejects a reused stream ticket so EventSource stops retries', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const ticketRes = await app.request('/events/ticket', { method: 'POST' });
      const { ticket } = await ticketRes.json() as { ticket: string };

      const first = await app.request(`/events?ticket=${ticket}`);
      expect(first.status).toBe(200);
      await first.body?.cancel();

      const second = await app.request(`/events?ticket=${ticket}`);
      expect(second.status).toBe(204);
      expect(await second.text()).toBe('');
    });

    it('rejects invalid stream tickets', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);

      const res = await app.request('/events?ticket=bogus');

      expect(res.status).toBe(401);
      const body = await res.json() as { error: { message: string } };
      expect(body.error.message).toBe('Invalid or expired ticket');
    });

    it('sends initial snapshot event in the stream', async () => {
      const deps = createMockDeps();
      const app = createDashboardRoutes(deps);
      const ticketRes = await app.request('/events/ticket', { method: 'POST' });
      const { ticket } = await ticketRes.json() as { ticket: string };
      const res = await app.request(`/events?ticket=${ticket}`);

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

    it('streams a fresh snapshot when dashboard state changes after connect', async () => {
      vi.useFakeTimers();
      try {
        const deps = createMockDeps();
        const providers = deps.getProviders as ReturnType<typeof vi.fn>;
        const app = createDashboardRoutes(deps);
        const ticketRes = await app.request('/events/ticket', { method: 'POST' });
        const { ticket } = await ticketRes.json() as { ticket: string };
        const res = await app.request(`/events?ticket=${ticket}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let text = '';
        for (let i = 0; i < 10; i++) {
          const { value, done } = await reader.read();
          if (value) text += decoder.decode(value, { stream: true });
          if (done || text.includes('event: snapshot')) break;
        }

        providers.mockReturnValue([
          { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
          { name: 'ollama', type: 'ollama', available: true, failoverOrder: 1 },
        ]);

        const nextRead = reader.read();
        await vi.advanceTimersByTimeAsync(1_000);
        const { value } = await nextRead;
        if (value) text += decoder.decode(value, { stream: true });
        reader.cancel();

        expect(text).toContain('"name":"ollama"');
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps polling after one snapshot refresh throws', async () => {
      vi.useFakeTimers();
      try {
        const deps = createMockDeps();
        const providers = deps.getProviders as ReturnType<typeof vi.fn>;
        const app = createDashboardRoutes(deps);
        const ticketRes = await app.request('/events/ticket', { method: 'POST' });
        const { ticket } = await ticketRes.json() as { ticket: string };
        const res = await app.request(`/events?ticket=${ticket}`);
        const reader = res.body!.getReader();

        await reader.read();
        providers.mockImplementation(() => {
          throw new Error('config read failed');
        });

        await vi.advanceTimersByTimeAsync(1_000);
        providers.mockReturnValue([
          { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
          { name: 'ollama', type: 'ollama', available: true, failoverOrder: 1 },
        ]);

        const nextRead = reader.read();
        await vi.advanceTimersByTimeAsync(1_000);
        const { value } = await nextRead;
        const text = value ? new TextDecoder().decode(value) : '';
        reader.cancel();

        expect(text).toContain('"name":"ollama"');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
