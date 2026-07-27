import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OllamaRuntimeAdapter,
  RuntimeActionRequestSchema,
  RuntimeSnapshotSchema,
} from '../../../src/runtime/index.js';

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
  it('returns a typed unsupported result for governed mutations', async () => {
    const adapter = new OllamaRuntimeAdapter({ endpoints: [] });
    const request = RuntimeActionRequestSchema.parse({
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      idempotencyKey: 'block:t_deadbeef:ollama-read-only',
      action: {
        type: 'blocker.add', workspaceId: 'ollama:default', taskId: 'ollama:default:t_deadbeef',
        category: 'transient', reason: 'Retry later',
      },
    });

    await expect(adapter.executeAction(request)).resolves.toEqual({
      status: 'unsupported',
      providerId: 'ollama',
      correlationId: request.correlationId,
      reason: 'The Ollama adapter is read-only',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'blocker.add',
        targetId: 'ollama:default:t_deadbeef',
        outcome: 'unsupported',
      },
    });
  });

  it('rejects empty endpoint identifiers during construction', () => {
    expect(() => new OllamaRuntimeAdapter({
      endpoints: [{ id: '', baseUrl: 'http://127.0.0.1:11434' }],
    })).toThrow(/endpoint id/i);
  });

  it('rejects duplicate endpoint identifiers during construction', () => {
    expect(() => new OllamaRuntimeAdapter({
      endpoints: [
        { id: 'shared', baseUrl: 'http://127.0.0.1:11434' },
        { id: 'shared', baseUrl: 'http://127.0.0.1:11435' },
      ],
    })).toThrow(/unique/i);
  });

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

  it('keeps cloud-compatible endpoints available when daemon introspection routes are unsupported', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/tags') {
        return Response.json({ models: [{ model: 'gpt-oss:120b-cloud', size: 0 }] });
      }
      return Response.json({ error: 'not found' }, { status: 404 });
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'cloud', baseUrl: 'https://ollama.example' }],
      egressPolicy: { enabled: false },
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({
      state: 'ready',
      workspaces: {
        data: [{
          state: 'available',
          metadata: {
            installedModelCount: 1,
            installedModels: 'gpt-oss:120b-cloud',
            loadedModelCount: 0,
          },
        }],
      },
    });
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

  it('normalizes the common scheme-less OLLAMA_HOST form', async () => {
    const endpoint = await ollamaServer();
    const adapter = new OllamaRuntimeAdapter({
      env: { OLLAMA_HOST: endpoint.baseUrl.replace(/^http:\/\//u, '') },
    });

    await expect(adapter.describe()).resolves.toMatchObject({
      health: { state: 'connected' },
    });
    expect(endpoint.paths).toEqual(['/api/version', '/api/tags', '/api/ps']);
  });

  it('accepts standard dot-localhost aliases as plaintext loopback endpoints', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/version') return Response.json({ version: '0.11.4' });
      return Response.json({ models: [] });
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'local-alias', baseUrl: 'http://ollama.localhost:11434' }],
      fetchImpl,
    });

    await expect(adapter.describe()).resolves.toMatchObject({
      health: { state: 'connected' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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

  it('cancels every response body when any Ollama API request fails', async () => {
    const cancellations = [vi.fn(), vi.fn(), vi.fn()];
    let index = 0;
    const fetchImpl = vi.fn(async () => {
      const cancel = cancellations[index++]!;
      return new Response(new ReadableStream({ cancel }), { status: index === 1 ? 500 : 200 });
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({ state: 'unavailable' });
    for (const cancel of cancellations) expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels fulfilled sibling response bodies when an Ollama transport request rejects', async () => {
    const cancellations = [vi.fn(), vi.fn()];
    let index = 0;
    const fetchImpl = vi.fn(async () => {
      const call = index++;
      if (call === 1) throw new TypeError('transport failed');
      return new Response(new ReadableStream({ cancel: cancellations[call === 0 ? 0 : 1] }));
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({ state: 'unavailable' });
    for (const cancel of cancellations) expect(cancel).toHaveBeenCalledOnce();
  });

  it('marks schema-incompatible successful responses unavailable', async () => {
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl: vi.fn(async () => Response.json({})),
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({
      state: 'unavailable',
      workspaces: {
        data: [{ metadata: { diagnostic: 'Ollama endpoint returned an invalid API payload' } }],
      },
    });
  });

  it('cancels sibling response bodies when JSON normalization fails', async () => {
    const siblingCancellations = [vi.fn(), vi.fn()];
    let index = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const call = index++;
      if (call === 0) return new Response('{');
      return new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            siblingCancellations[call - 1]!();
            controller.error(new DOMException('aborted', 'AbortError'));
          }, { once: true });
        },
      }));
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({ state: 'unavailable' });
    for (const cancellation of siblingCancellations) expect(cancellation).toHaveBeenCalledOnce();
  });

  it('rejects model arrays whose entries lack a usable identity', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/version') return Response.json({ version: '0.11.4' });
      if (path === '/api/tags') return Response.json({ models: [{}] });
      return Response.json({ models: [] });
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({
      state: 'unavailable',
      workspaces: {
        data: [{ metadata: { diagnostic: 'Ollama endpoint returned an invalid API payload' } }],
      },
    });
  });

  it('uses the first nonblank model identity field', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/version') return Response.json({ version: '0.11.4' });
      if (path === '/api/tags') {
        return Response.json({ models: [{ name: '   ', model: 'qwen3:8b', size: 42 }] });
      }
      return Response.json({ models: [] });
    });
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
    });

    await expect(adapter.getSnapshot()).resolves.toMatchObject({
      state: 'ready',
      workspaces: {
        data: [{ metadata: { installedModelCount: 1, installedModels: 'qwen3:8b' } }],
      },
    });
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

  it('reports the cached poll timestamp until a new health check runs', async () => {
    const endpoint = await ollamaServer();
    let now = new Date('2026-07-26T12:00:00.000Z');
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: endpoint.baseUrl }],
      minimumPollIntervalMs: 60_000,
      now: () => now,
    });

    const first = await adapter.describe();
    now = new Date('2026-07-26T12:00:30.000Z');
    const cached = await adapter.describe();

    expect(first.health.checkedAt).toBe('2026-07-26T12:00:00.000Z');
    expect(cached.health.checkedAt).toBe(first.health.checkedAt);
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

  it('starts a fresh poll instead of joining an aborted shared poll', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls <= 3) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 50);
          }, { once: true });
        });
      }
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/version') return Response.json({ version: '0.11.4' });
      return Response.json({ models: [] });
    });
    const controller = new AbortController();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
      minimumPollIntervalMs: 0,
    });

    const cancelled = adapter.getSnapshot({ signal: controller.signal });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(cancelled).resolves.toMatchObject({ state: 'unavailable' });
    await expect(adapter.getSnapshot()).resolves.toMatchObject({ state: 'ready' });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('does not restart an aborted shared poll after the final replacement waiter cancels', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls <= 3) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 50);
          }, { once: true });
        });
      }
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === '/api/version') return Response.json({ version: '0.11.4' });
      return Response.json({ models: [] });
    });
    const firstController = new AbortController();
    const replacementController = new AbortController();
    const adapter = new OllamaRuntimeAdapter({
      endpoints: [{ id: 'lab', baseUrl: 'http://127.0.0.1:11434' }],
      fetchImpl,
      minimumPollIntervalMs: 0,
    });

    const first = adapter.getSnapshot({ signal: firstController.signal });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    firstController.abort();
    const replacement = adapter.getSnapshot({ signal: replacementController.signal });
    replacementController.abort();

    await expect(first).resolves.toMatchObject({ state: 'unavailable' });
    await expect(replacement).resolves.toMatchObject({ state: 'unavailable' });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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
