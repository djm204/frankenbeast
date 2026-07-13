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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

    it('prefers flat server error messages over bare HTTP status codes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Skill "missing" was not found' }),
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.toggleSkill('missing', true)).rejects.toThrow('Skill "missing" was not found');
    });
  });

  describe('updateSecurityProfile', () => {
    it('sends PATCH with profile value and returns resolved security config', async () => {
      const security = { ...makeMockSnapshot().security, profile: 'strict', requireApproval: 'all' };
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => security });

      const client = new DashboardApiClient(BASE_URL);
      const result = await client.updateSecurityProfile('strict');

      expect(result).toEqual(security);
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

    it('surfaces strict-profile server guidance in the thrown error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Security profile "strict" requires allowedDomains to be configured' }),
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.updateSecurityProfile('strict')).rejects.toThrow(
        'Security profile "strict" requires allowedDomains to be configured',
      );
    });

    it('also accepts enveloped server error messages', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Profile update failed' } }),
      });

      const client = new DashboardApiClient(BASE_URL);
      await expect(client.updateSecurityProfile('strict')).rejects.toThrow('Profile update failed');
    });
  });

  describe('browser credential handling', () => {
    it('does not attach bearer credentials from the browser client', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => makeMockSnapshot() });
      globalThis.fetch = fetchMock;

      const client = new DashboardApiClient(BASE_URL);
      await client.fetchSnapshot();
      await client.toggleSkill('code-review', false);
      await client.updateSecurityProfile('strict');

      const [snapshotUrl, snapshotInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(snapshotUrl).toBe(`${BASE_URL}/api/dashboard`);
      expect(snapshotInit).toBeUndefined();

      const [skillUrl, skillInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(skillUrl).toBe(`${BASE_URL}/api/skills/code-review`);
      expect(skillInit.method).toBe('PATCH');
      const skillHeaders = new Headers(skillInit.headers);
      expect(skillHeaders.get('content-type')).toBe('application/json');
      expect(skillHeaders.has('authorization')).toBe(false);

      const [securityUrl, securityInit] = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(securityUrl).toBe(`${BASE_URL}/api/security`);
      expect(securityInit.method).toBe('PATCH');
      const securityHeaders = new Headers(securityInit.headers);
      expect(securityHeaders.get('content-type')).toBe('application/json');
      expect(securityHeaders.has('authorization')).toBe(false);
    });
  });

  describe('subscribeToDashboard', () => {
    it('mints a short-lived ticket before opening EventSource', async () => {
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
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ticket: 'dashboard-ticket' }),
      });

      try {
        const sameOriginBaseUrl = globalThis.location.origin;
        const client = new DashboardApiClient(sameOriginBaseUrl);
        const onSnapshot = vi.fn();
        const unsub = await client.subscribeToDashboard(onSnapshot);

        expect(globalThis.fetch).toHaveBeenCalledWith(
          `${sameOriginBaseUrl}/api/dashboard/events/ticket`,
          expect.objectContaining({ method: 'POST' }),
        );
        const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
        expect(new Headers(init.headers).has('authorization')).toBe(false);
        expect(MockEventSource).toHaveBeenCalledWith(`${sameOriginBaseUrl}/api/dashboard/events?ticket=dashboard-ticket`);

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

    it('reports malformed snapshot payloads without throwing out of the EventSource listener', async () => {
      const listeners: Record<string, (event: { data: string }) => void> = {};

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data: string }) => void) => void;
        close?: () => void;
      }) {
        this.addEventListener = vi.fn((type: string, handler: (event: { data: string }) => void) => {
          listeners[type] = handler;
        });
        this.close = vi.fn();
      });

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ticket: 'dashboard-ticket' }),
      });

      try {
        const client = new DashboardApiClient(BASE_URL);
        const onSnapshot = vi.fn();
        const onError = vi.fn();
        const unsub = await client.subscribeToDashboard(onSnapshot, onError);

        expect(() => listeners['snapshot']!({ data: '{not-json' })).not.toThrow();
        expect(onSnapshot).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));

        unsub();
      } finally {
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });

    it('mints a fresh one-shot ticket after EventSource errors', async () => {
      vi.useFakeTimers();
      const closeFns = [vi.fn(), vi.fn()];
      const listeners: Array<Record<string, (event: { data?: string }) => void>> = [];

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data?: string }) => void) => void;
        close?: () => void;
      }) {
        const index = listeners.length;
        listeners[index] = {};
        this.addEventListener = vi.fn((type: string, handler: (event: { data?: string }) => void) => {
          listeners[index]![type] = handler;
        });
        this.close = closeFns[index];
      });

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-2' }) });

      try {
        const client = new DashboardApiClient(BASE_URL);
        const unsub = await client.subscribeToDashboard(vi.fn());

        listeners[0]!.error!({});
        expect(closeFns[0]).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1_000);

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(MockEventSource).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/dashboard/events?ticket=ticket-1`);
        expect(MockEventSource).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/dashboard/events?ticket=ticket-2`);

        unsub();
        expect(closeFns[1]).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });

    it('retries ticket minting failures during reconnect', async () => {
      vi.useFakeTimers();
      const closeFns = [vi.fn(), vi.fn()];
      const listeners: Array<Record<string, (event: { data?: string }) => void>> = [];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data?: string }) => void) => void;
        close?: () => void;
      }) {
        const index = listeners.length;
        listeners[index] = {};
        this.addEventListener = vi.fn((type: string, handler: (event: { data?: string }) => void) => {
          listeners[index]![type] = handler;
        });
        this.close = closeFns[index];
      });

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-1' }) })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-2' }) });

      try {
        const client = new DashboardApiClient(BASE_URL);
        const onError = vi.fn();
        const unsub = await client.subscribeToDashboard(vi.fn(), onError);

        listeners[0]!.error!({});
        await vi.advanceTimersByTimeAsync(1_000);
        expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
        expect(onError).toHaveBeenCalledTimes(2);
        expect(onError.mock.calls[0]![0].message).toBe('Dashboard stream connection lost. Reconnecting.');
        expect(onError.mock.calls[1]![0].message).toBe('Dashboard stream reconnect failed. HTTP 503');
        expect(MockEventSource).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect(MockEventSource).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/dashboard/events?ticket=ticket-2`);

        unsub();
        expect(closeFns[1]).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        errorSpy.mockRestore();
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });

    it('reports EventSource errors after the stream opens and keeps retrying', async () => {
      vi.useFakeTimers();
      const closeFns = [vi.fn(), vi.fn()];
      const listeners: Array<Record<string, (event: { data?: string }) => void>> = [];

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data?: string }) => void) => void;
        close?: () => void;
      }) {
        const index = listeners.length;
        listeners[index] = {};
        this.addEventListener = vi.fn((type: string, handler: (event: { data?: string }) => void) => {
          listeners[index]![type] = handler;
        });
        this.close = closeFns[index];
      });

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-2' }) });

      try {
        const client = new DashboardApiClient(BASE_URL);
        const onError = vi.fn();
        const unsub = await client.subscribeToDashboard(vi.fn(), onError);

        listeners[0]!.error!({});

        expect(closeFns[0]).toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onError.mock.calls[0]![0].message).toBe('Dashboard stream connection lost. Reconnecting.');

        await vi.advanceTimersByTimeAsync(1_000);
        expect(MockEventSource).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/dashboard/events?ticket=ticket-2`);

        unsub();
      } finally {
        vi.useRealTimers();
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });

    it('does not report reconnect ticket failures after unsubscribe', async () => {
      vi.useFakeTimers();
      const closeFn = vi.fn();
      const listeners: Array<Record<string, (event: { data?: string }) => void>> = [];
      const reconnectTicket = deferred<{ ok: boolean; status: number }>();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data?: string }) => void) => void;
        close?: () => void;
      }) {
        const index = listeners.length;
        listeners[index] = {};
        this.addEventListener = vi.fn((type: string, handler: (event: { data?: string }) => void) => {
          listeners[index]![type] = handler;
        });
        this.close = closeFn;
      });

      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: 'ticket-1' }) })
        .mockReturnValueOnce(reconnectTicket.promise);

      try {
        const client = new DashboardApiClient(BASE_URL);
        const onError = vi.fn();
        const unsub = await client.subscribeToDashboard(vi.fn(), onError);

        listeners[0]!.error!({});
        await vi.advanceTimersByTimeAsync(1_000);
        unsub();
        reconnectTicket.resolve({ ok: false, status: 503 });
        await Promise.resolve();

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]![0].message).toBe('Dashboard stream connection lost. Reconnecting.');
        expect(errorSpy).not.toHaveBeenCalledWith(expect.any(Error));
      } finally {
        vi.useRealTimers();
        errorSpy.mockRestore();
        if (originalEventSource) {
          globalThis.EventSource = originalEventSource;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (globalThis as any).EventSource;
        }
      }
    });

    it('opens the local loopback stream without a ticket when auth is disabled', async () => {
      const closeFn = vi.fn();
      const MockEventSource = vi.fn(function (this: {
        addEventListener?: (type: string, handler: (event: { data?: string }) => void) => void;
        close?: typeof closeFn;
      }) {
        this.addEventListener = vi.fn();
        this.close = closeFn;
      });
      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ticket: null }),
      });

      try {
        const client = new DashboardApiClient(BASE_URL);
        const unsub = await client.subscribeToDashboard(vi.fn());

        expect(MockEventSource).toHaveBeenCalledWith(`${BASE_URL}/api/dashboard/events`);
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

    it('does not open EventSource when ticket minting fails', async () => {
      const MockEventSource = vi.fn();
      const originalEventSource = globalThis.EventSource;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = MockEventSource;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

      try {
        const client = new DashboardApiClient('https://orchestrator.example.test');

        await expect(client.subscribeToDashboard(vi.fn())).rejects.toThrow('HTTP 401');
        expect(MockEventSource).not.toHaveBeenCalled();
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
