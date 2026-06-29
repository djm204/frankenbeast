import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkApiClient, withOperatorAuth } from './network-api';

const BASE_URL = 'http://localhost:3737';

describe('NetworkApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('attaches the operator token as a bearer header when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { services: [] } }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL, 'op-token');
    await client.getStatus();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/network/status`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer op-token');
  });

  it('preserves existing headers alongside the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL, 'op-token');
    await client.updateConfig(['chat:on']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/network/config`);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer op-token');
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

    const client = new NetworkApiClient(BASE_URL, 'op-token');
    await expect(client.getStatus()).rejects.toThrow('HTTP 401');
  });
});

describe('withOperatorAuth', () => {
  it('returns the init unchanged when no token is set', () => {
    const init = { method: 'GET' };
    expect(withOperatorAuth(init, undefined)).toBe(init);
  });

  it('merges the bearer header without mutating the original init', () => {
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const result = withOperatorAuth(init, 'op-token');

    expect(result.method).toBe('POST');
    const headers = new Headers(result.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer op-token');
    // original init must be untouched
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('preserves Headers-instance headers while adding the bearer token', () => {
    const result = withOperatorAuth(
      { headers: new Headers({ 'Content-Type': 'application/json', 'X-Custom': 'v' }) },
      'op-token',
    );

    const headers = new Headers(result.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-custom')).toBe('v');
    expect(headers.get('authorization')).toBe('Bearer op-token');
  });

  it('preserves entry-array headers while adding the bearer token', () => {
    const result = withOperatorAuth(
      { headers: [['Content-Type', 'application/json']] as [string, string][] },
      'op-token',
    );

    const headers = new Headers(result.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer op-token');
  });
});
