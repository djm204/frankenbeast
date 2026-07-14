import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkApiClient, NetworkApiError } from '../../src/lib/network-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const responseBody = (value: string) => new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(value));
    controller.close();
  },
});

describe('NetworkApiClient', () => {
  const client = new NetworkApiClient('http://localhost:3000');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads network status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          mode: 'secure',
          secureBackend: 'local-encrypted',
          services: [{ id: 'chat-server', status: 'running' }],
        },
      }),
    });

    const status = await client.getStatus();
    expect(status.mode).toBe('secure');
    expect(status.services[0]?.id).toBe('chat-server');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/network/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('starts and stops services', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { ok: true } }),
    });

    await client.start('chat-server');
    await client.stop('all');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/network/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ target: 'chat-server' }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/network/stop',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ target: 'all' }),
      }),
    );
  });

  it('updates config with --set style assignments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          network: { mode: 'insecure' },
        },
      }),
    });

    const config = await client.updateConfig(['network.mode=insecure']);
    expect(config.network.mode).toBe('insecure');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/network/config',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assignments: ['network.mode=insecure'] }),
      }),
    );
  });

  it('loads logs for a service', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { logs: ['/tmp/chat-server.log'] },
      }),
    });

    const result = await client.getLogs('chat-server');
    expect(result.logs).toEqual(['/tmp/chat-server.log']);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/network/logs/chat-server',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('surfaces structured network error envelopes with status and code context', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      body: responseBody(JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ path: ['assignments'], message: 'Expected array' }],
        },
      })),
    });

    try {
      await client.updateConfig(['network.mode=insecure']);
      throw new Error('Expected updateConfig to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkApiError);
      expect((error as Error).message).toBe('Request validation failed (HTTP 422, VALIDATION_ERROR) for /v1/network/config');
      expect((error as NetworkApiError).status).toBe(422);
      expect((error as NetworkApiError).code).toBe('VALIDATION_ERROR');
      expect((error as NetworkApiError).details).toEqual([{ path: ['assignments'], message: 'Expected array' }]);
    }
  });

  it('includes endpoint and response body when network error bodies are malformed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('<html>proxy down</html>'),
    });

    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: <html>proxy down</html>',
    );
  });

  it('bounds streamed malformed network error bodies before formatting diagnostics', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(3000)));
      },
    });
    mockFetch.mockResolvedValueOnce(new Response(stream, {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await expect(client.getStatus()).rejects.toThrow(
      `HTTP 502 Bad Gateway for /v1/network/status: ${'x'.repeat(2048)}…`,
    );
  });

  it('redacts unterminated auth fields from malformed network error bodies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: responseBody('{"Authorization":"Bearer proxy-token'),
    });

    await expect(client.getStatus()).rejects.toThrow(
      'HTTP 502 Bad Gateway for /v1/network/status: {"Authorization":"[REDACTED]"',
    );
  });
});
