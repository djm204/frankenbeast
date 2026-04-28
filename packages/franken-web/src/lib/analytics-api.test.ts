import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsApiClient } from './analytics-api';

const BASE_URL = 'http://localhost:3737';

describe('AnalyticsApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches summary with encoded filters', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalEvents: 1 }),
    });

    const client = new AnalyticsApiClient(BASE_URL);
    const result = await client.fetchSummary({ sessionId: 'session a', outcome: 'denied' });

    expect(result).toEqual({ totalEvents: 1 });
    expect(globalThis.fetch).toHaveBeenCalledWith(`${BASE_URL}/api/analytics/summary?sessionId=session+a&outcome=denied`);
  });

  it('fetches sessions, events, and event detail', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessions: [{ id: 'session-a' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [{ id: 'audit:1' }], total: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'audit:1', raw: {} }) });

    const client = new AnalyticsApiClient(BASE_URL);

    await expect(client.fetchSessions({ timeWindow: '24h' })).resolves.toEqual([{ id: 'session-a' }]);
    await expect(client.fetchEvents({ toolQuery: 'observer' })).resolves.toMatchObject({ total: 1 });
    await expect(client.fetchEventDetail('audit:1')).resolves.toMatchObject({ id: 'audit:1' });
  });

  it('throws on failed responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const client = new AnalyticsApiClient(BASE_URL);
    await expect(client.fetchSummary({})).rejects.toThrow('HTTP 500');
  });
});
