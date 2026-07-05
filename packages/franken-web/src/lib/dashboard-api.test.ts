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
      { name: 'anthropic', type: 'llm', available: true, failoverOrder: 0 },
      { name: 'openai', type: 'llm', available: false, failoverOrder: 1 },
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

  describe('operator token', () => {
    it('does not attach bearer headers from the browser dashboard client', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => makeMockSnapshot() });
      globalThis.fetch = fetchMock;

      const client = new DashboardApiClient(BASE_URL);
      await client.fetchSnapshot();
      await client.toggleSkill('code-review', false);
      await client.updateSecurityProfile('strict');

      expect(fetchMock).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/dashboard`);

      const [, skillInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(skillInit.method).toBe('PATCH');
      const skillHeaders = new Headers(skillInit.headers);
      expect(skillHeaders.get('content-type')).toBe('application/json');
      expect(skillHeaders.has('authorization')).toBe(false);

      const [, securityInit] = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(securityInit.method).toBe('PATCH');
      const securityHeaders = new Headers(securityInit.headers);
      expect(securityHeaders.get('content-type')).toBe('application/json');
      expect(securityHeaders.has('authorization')).toBe(false);
    });
  });

  describe('subscribeToDashboard', () => {
    it('creates EventSource and returns unsubscribe function', () => {
      const closeFn = vi.fn();
      const listeners: Record<string, (event: { data: string }) => void> = {};

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data: string }) => void) => void;
        close?: typeof closeFn;
      }) {
        this.addEventListener = vi.fn((type: string, handler: (event: { data: string }) => void) => {
          listeners[type] = handler;
        });
        this.close = closeFn;
      });

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
