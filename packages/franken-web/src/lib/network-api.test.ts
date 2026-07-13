import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkApiClient } from './network-api';

const BASE_URL = 'http://localhost:3737';
const responseBody = (value: string) => new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(value));
    controller.close();
  },
});

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
      body: responseBody('missing token'),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow('HTTP 401 Unauthorized for /v1/network/status: missing token');
  });

  it('truncates oversized raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('x'.repeat(3000)),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      `HTTP 502 Bad Gateway for /v1/network/status: ${'x'.repeat(2048)}…`,
    );
  });

  it('preserves oversized structured network error envelopes', async () => {
    const details = Array.from({ length: 200 }, (_, index) => ({ path: ['assignments', index], message: 'Expected valid target assignment' }));
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
    }), {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = new NetworkApiClient(BASE_URL);
    try {
      await client.updateConfig(['network.mode=insecure']);
      throw new Error('Expected updateConfig to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Request validation failed (HTTP 422, VALIDATION_ERROR) for /v1/network/config');
      expect((error as { details?: unknown }).details).toEqual(details);
    }
  });

  it('redacts echoed auth headers from raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('{"Authorization":"Bearer proxy-token","x-api-key":"proxy-key"}'),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: {"Authorization":"[REDACTED]","x-api-key":"[REDACTED]"}',
    );
  });

  it('bounds streamed raw error bodies', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(3000)));
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(stream, {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      `HTTP 502 Bad Gateway for /v1/network/status: ${'x'.repeat(2048)}…`,
    );
  });

  it('redacts unterminated auth fields from raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('{"Authorization":"Bearer proxy-token'),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: {"Authorization":"[REDACTED]"',
    );
  });

  it('redacts credential-bearing URLs from raw error bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('upstream https://user:pass@hooks.slack.com/services/T000/B000/secret?token=secret failed'),
    });

    const client = new NetworkApiClient(BASE_URL);
    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: upstream https://hooks.slack.com/services/[REDACTED] failed',
    );
  });
});
