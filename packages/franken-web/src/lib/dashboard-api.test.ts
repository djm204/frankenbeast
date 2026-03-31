import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardApiClient, type DashboardSnapshot } from './dashboard-api';

const BASE_URL = 'http://localhost:3737';

function makeMockSnapshot(): DashboardSnapshot {
  return {
    skills: [
      { name: 'code-review', enabled: true, hasContext: true, mcpServerCount: 1 },
      { name: 'web-search', enabled: false, hasContext: false, mcpServerCount: 0 },
    ],
    security: {
      profile: 'standard',
      injectionDetection: true,
      piiMasking: false,
      outputValidation: true,
    },
    providers: [
      { name: 'anthropic', type: 'llm' },
      { name: 'openai', type: 'llm' },
    ],
  };
}

describe('DashboardApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchSnapshot', () => {
    it('returns parsed snapshot on success', async () => {
      const snapshot = makeMockSnapshot();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => snapshot,
      });

      const client = new DashboardApiClient(BASE_URL);
      const result = await client.fetchSnapshot();

      expect(result).toEqual(snapshot);
      expect(globalThis.fetch).toHaveBeenCalledWith(`${BASE_URL}/api/dashboard`);
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.fetchSnapshot()).rejects.toThrow('HTTP 500');
    });
  });

  describe('toggleSkill', () => {
    it('sends PATCH with enabled flag', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const client = new DashboardApiClient(BASE_URL);
      await client.toggleSkill('code-review', false);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/skills/code-review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        },
      );
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.toggleSkill('missing', true)).rejects.toThrow('HTTP 404');
    });
  });

  describe('updateSecurityProfile', () => {
    it('sends PATCH with profile value', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const client = new DashboardApiClient(BASE_URL);
      await client.updateSecurityProfile('strict');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/security`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: 'strict' }),
        },
      );
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.updateSecurityProfile('strict')).rejects.toThrow('HTTP 403');
    });
  });

  describe('subscribeToDashboard', () => {
    it('creates EventSource and returns unsubscribe function', () => {
      const closeFn = vi.fn();
      const listeners: Record<string, (event: { data: string }) => void> = {};

      const MockEventSource = vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn((type: string, handler: (event: { data: string }) => void) => {
          listeners[type] = handler;
        }),
        close: closeFn,
      }));

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;

      try {
        const client = new DashboardApiClient(BASE_URL);
        const onSnapshot = vi.fn();
        const unsub = client.subscribeToDashboard(onSnapshot);

        expect(MockEventSource).toHaveBeenCalledWith(`${BASE_URL}/api/dashboard/events`);

        // Simulate a snapshot event
        const snapshot = makeMockSnapshot();
        listeners['snapshot']!({ data: JSON.stringify(snapshot) });
        expect(onSnapshot).toHaveBeenCalledWith(snapshot);

        // Unsubscribe
        unsub();
        expect(closeFn).toHaveBeenCalled();
      } finally {
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });
  });
});
