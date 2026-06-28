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

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/v1/network/status`,
      expect.objectContaining({ method: 'GET', headers: { authorization: 'Bearer op-token' } }),
    );
  });

  it('preserves existing headers alongside the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    globalThis.fetch = fetchMock;

    const client = new NetworkApiClient(BASE_URL, 'op-token');
    await client.updateConfig(['chat:on']);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/v1/network/config`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer op-token' },
      }),
    );
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

    expect(result).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer op-token' },
    });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
