import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkApiClient } from '../../src/lib/network-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
});
