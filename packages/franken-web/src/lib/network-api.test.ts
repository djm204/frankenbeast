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

  it('sends network requests without browser bearer credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { services: [] } }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL);
    await client.getStatus();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/network/status`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('preserves caller headers without adding authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL);
    await client.updateConfig(['chat:on']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/network/config`);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.has('authorization')).toBe(false);
  });

  it('throws non-ok responses with endpoint and response body context', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'missing token',
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow('HTTP 401 Unauthorized for /v1/network/status: missing token');
  });

  it('truncates oversized raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'x'.repeat(3000),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      `HTTP 502 Bad Gateway for /v1/network/status: ${'x'.repeat(2048)}…`,
    );
  });

  it('redacts echoed auth headers from raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '{"Authorization":"Bearer proxy-token","x-api-key":"proxy-key"}',
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: {"Authorization":[REDACTED],"x-api-key":[REDACTED]}',
    );
  });
});
