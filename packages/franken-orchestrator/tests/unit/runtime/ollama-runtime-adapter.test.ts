import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { OllamaRuntimeAdapter, RuntimeSnapshotSchema } from '../../../src/runtime/index.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }));
});

async function ollamaServer(): Promise<{ baseUrl: string; paths: string[]; authorizations: Array<string | undefined> }> {
  const paths: string[] = [];
  const authorizations: Array<string | undefined> = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
    authorizations.push(request.headers.authorization);
    response.setHeader('content-type', 'application/json');
    switch (request.url) {
      case '/api/version':
        response.end(JSON.stringify({ version: '0.11.4' }));
        break;
      case '/api/tags':
        response.end(JSON.stringify({
          models: [
            { name: 'qwen3:8b', model: 'qwen3:8b', modified_at: '2026-07-26T12:00:00Z', size: 5_100, digest: 'sha256:qwen' },
            { name: 'gpt-oss:120b-cloud', model: 'gpt-oss:120b-cloud', modified_at: '2026-07-26T11:00:00Z', size: 0, digest: 'sha256:cloud' },
          ],
        }));
        break;
      case '/api/ps':
        response.end(JSON.stringify({
          models: [{
            name: 'qwen3:8b',
            model: 'qwen3:8b',
            size: 5_100,
            size_vram: 4_096,
            digest: 'sha256:qwen',
            expires_at: '2026-07-26T12:05:00Z',
          }],
        }));
        break;
      default:
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'not found' }));
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return { baseUrl: `http://127.0.0.1:${address.port}`, paths, authorizations };
}

async function hangingServer(): Promise<string> {
  const server = createServer(() => {
    // Deliberately leave the response open so the adapter timeout owns cancellation.
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

async function cancellableHangingServer(): Promise<{ baseUrl: string; requestClosed: Promise<void> }> {
  let resolveRequestClosed: (() => void) | undefined;
  const requestClosed = new Promise<void>((resolve) => {
    resolveRequestClosed = resolve;
  });
  const server = createServer((request) => {
    request.socket.once('close', () => resolveRequestClosed?.());
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requestClosed };
}

async function oversizedServer(): Promise<string> {
  const body = JSON.stringify({ padding: 'x'.repeat(256) });
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('content-length', Buffer.byteLength(body));
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

async function redirectServer(location: string): Promise<string> {
  const server = createServer((_request, response) => {
    response.statusCode = 302;
    response.setHeader('location', location);
    response.end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

async function malformedNumericServer(): Promise<string> {
  const model = { name: 'oversized', size: Number.MAX_VALUE, size_vram: Number.MAX_VALUE };
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/version') response.end(JSON.stringify({ version: '0.11.4' }));
    else response.end(JSON.stringify({ models: [model, { ...model, name: 'oversized-2' }] }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('OllamaRuntimeAdapter', () => {
  it('rejects event cursors because Ollama does not expose historical runtime events', () => {
    const adapter = new OllamaRuntimeAdapter();

    expect(() => adapter.validateEventCursor('opaque-cursor')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
  });

  it('rejects invalid polling bounds during construction', () => {
    expect(() => new OllamaRuntimeAdapter({ requestTimeoutMs: Number.NaN })).toThrow(/requestTimeoutMs/);
    expect(() => new OllamaRuntimeAdapter({ maxResponseBytes: 0 })).toThrow(/maxResponseBytes/);
    expect(() => new OllamaRuntimeAdapter({ minimumPollIntervalMs: -1 })).toThrow(/minimumPollIntervalMs/);
  });

  it('rejects endpoint sets that exceed the bounded polling fan-out', () => {
    const endpoints = Array.from({ length: 33 }, (_, index) => ({
      id: `endpoint-${index}`,
      baseUrl: 'http://127.0.0.1:11434',
    }));

    expect(() => new OllamaRuntimeAdapter({ endpoints })).toThrow(/at most 32 endpoints/);
  });

  it('maps configured endpoint health and real model process metadata without synthetic runtime entities', async () => {
    const endpoint = await ollamaServer();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      now: () => new Date('2026-07-26T12:00:00.000Z'),
    });

    await expect(adapter.describe()).resolves.toMatchObject({
      id: 'ollama',
      health: { state: 'connected' },
      metadata: { configuredEndpointCount: 1, connectedEndpointCount: 1 },
    });
    const snapshot = RuntimeSnapshotSchema.parse(await adapter.getSnapshot());

    expect(snapshot).toMatchObject({
      providerId: 'ollama',
      state: 'ready',
      workspaces: {
        status: 'available',
        data: [{
          id: 'ollama:lab',
          name: 'lab',
          kind: 'workspace',
          state: 'available',
          metadata: {
            version: '0.11.4',
            installedModelCount: 2,
            installedModels: 'gpt-oss:120b-cloud,qwen3:8b',
            installedModelBytes: 5100,
            loadedModelCount: 1,
            loadedModels: 'qwen3:8b',
            loadedModelBytes: 5100,
            loadedVramBytes: 4096,
            nextLoadedModelExpiry: '2026-07-26T12:05:00.000Z',
          },
        }],
      },
      agents: { status: 'unsupported' },
      tasks: { status: 'unsupported' },
      runs: { status: 'unsupported' },
      events: { status: 'unsupported' },
      blockers: { status: 'unsupported' },
      approvals: { status: 'unsupported' },
    });
    expect(endpoint.paths).toEqual(['/api/version', '/api/tags', '/api/ps']);
  });

  it('scopes snapshots to the requested normalized endpoint workspace', async () => {
    const endpoint = await ollamaServer();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
    });

    const matching = await adapter.getSnapshot({ workspaceId: 'ollama:lab' });
    const missing = await adapter.getSnapshot({ workspaceId: 'ollama:other' });

    expect(matching.workspaces).toMatchObject({ status: 'available', data: [{ id: 'ollama:lab' }] });
    expect(missing.workspaces).toEqual({ status: 'available', data: [] });
  });

  it('discovers an explicitly configured host and resolves credentials only through an environment reference', async () => {
    const endpoint = await ollamaServer();
    const adapter = new OllamaRuntimeAdapter({
      env: {
        OLLAMA_HOST: endpoint.baseUrl,
        OLLAMA_API_KEY_REF: 'OLLAMA_CLOUD_TOKEN',
        OLLAMA_CLOUD_TOKEN: 'cloud-secret-token',
      },
    });

    const provider = await adapter.describe();

    expect(provider).toMatchObject({
      health: { state: 'connected' },
      metadata: { configuredEndpointCount: 1, connectedEndpointCount: 1 },
    });
    expect(JSON.stringify(provider)).not.toContain(endpoint.baseUrl);
    expect(JSON.stringify(provider)).not.toContain('cloud-secret-token');
    expect(endpoint.authorizations).toEqual([
      'Bearer cloud-secret-token',
      'Bearer cloud-secret-token',
      'Bearer cloud-secret-token',
    ]);
  });

  it('rejects plaintext non-loopback endpoints without exposing the configured URL', async () => {
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'remote', baseUrl: 'http://ollama.internal.example:11434/private' }],
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{
          id: 'ollama:remote',
          state: 'unavailable',
          metadata: { diagnostic: 'Remote Ollama endpoints must use HTTPS' },
        }],
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('ollama.internal.example');
  });

  it('applies the operator egress policy to arbitrary remote endpoints without leaking the host', async () => {
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'blocked', baseUrl: 'https://ollama.invalid' }],
      requestTimeoutMs: 20,
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{ metadata: { diagnostic: 'Ollama endpoint blocked by egress policy' } }],
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('ollama.invalid');
  });

  it('coalesces concurrent polls and rate-limits repeated endpoint reads', async () => {
    const endpoint = await ollamaServer();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      minimumPollIntervalMs: 10_000,
    });

    await Promise.all([adapter.describe(), adapter.getSnapshot(), adapter.describe()]);
    await adapter.getSnapshot();

    expect(endpoint.paths).toEqual(['/api/version', '/api/tags', '/api/ps']);
  });

  it('coalesces signal-bearing callers instead of allowing them to bypass poll limits', async () => {
    const endpoint = await ollamaServer();
    const controller = new AbortController();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      minimumPollIntervalMs: 10_000,
    });

    await Promise.all([
      adapter.getSnapshot({ signal: controller.signal }),
      adapter.getSnapshot({ signal: controller.signal }),
    ]);

    expect(endpoint.paths).toEqual(['/api/version', '/api/tags', '/api/ps']);
  });

  it('cancels endpoint polling through the snapshot request signal', async () => {
    const endpoint = await ollamaServer();
    const controller = new AbortController();
    controller.abort();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      minimumPollIntervalMs: 0,
    });

    const snapshot = await adapter.getSnapshot({ signal: controller.signal });

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{ metadata: { diagnostic: 'Ollama request cancelled' } }],
      },
    });
    expect(endpoint.paths).toEqual([]);
  });

  it('aborts the shared endpoint request when every polling caller cancels', async () => {
    const endpoint = await cancellableHangingServer();
    const controller = new AbortController();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      requestTimeoutMs: 5_000,
      minimumPollIntervalMs: 0,
    });

    const snapshotPromise = adapter.getSnapshot({ signal: controller.signal });
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    controller.abort();

    await expect(snapshotPromise).resolves.toMatchObject({ state: 'unavailable' });
    await expect(Promise.race([
      endpoint.requestClosed,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('request remained open')), 200)),
    ])).resolves.toBeUndefined();
  });

  it('bounds stalled endpoint requests with a configurable timeout', async () => {
    const baseUrl = await hangingServer();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'stalled', baseUrl }],
      requestTimeoutMs: 20,
      minimumPollIntervalMs: 0,
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{ metadata: { diagnostic: 'Ollama request timed out' } }],
      },
    });
  }, 500);

  it('rejects oversized API responses before normalizing endpoint data', async () => {
    const baseUrl = await oversizedServer();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'oversized', baseUrl }],
      maxResponseBytes: 64,
      minimumPollIntervalMs: 0,
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{ metadata: { diagnostic: 'Ollama response exceeds 64 bytes' } }],
      },
    });
  });

  it('normalizes malformed numeric model metadata without crashing the snapshot schema', async () => {
    const baseUrl = await malformedNumericServer();
    const adapter = new OllamaRuntimeAdapter({ endpoints: [{ id: 'malformed', baseUrl }] });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'ready',
      workspaces: {
        status: 'available',
        data: [{
          metadata: {
            installedModelBytes: 0,
            loadedModelBytes: 0,
            loadedVramBytes: 0,
          },
        }],
      },
    });
  });

  it('refuses endpoint redirects rather than bypassing configured transport validation', async () => {
    const target = await ollamaServer();
    const baseUrl = await redirectServer(target.baseUrl);
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'redirecting', baseUrl }],
      minimumPollIntervalMs: 0,
    });

    const snapshot = await adapter.getSnapshot();

    expect(snapshot).toMatchObject({
      state: 'unavailable',
      workspaces: {
        status: 'available',
        data: [{ id: 'ollama:redirecting', state: 'unavailable' }],
      },
    });
    expect(target.paths).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain(target.baseUrl);
  });
});
