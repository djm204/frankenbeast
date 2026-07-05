import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkApiClient } from './network-api';

const BASE_URL = 'http://localhost:3737';

describe('NetworkApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('omits the authorization header when no token is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { services: [] } }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL);
    await client.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/network/status`, { method: 'GET' });
  });

  it('throws on non-ok responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow('HTTP 401');
  });
});
