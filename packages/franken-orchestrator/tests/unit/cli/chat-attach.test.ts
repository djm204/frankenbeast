import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import {
  __chatAttachTestHooks,
  resolveManagedChatAttachment,
  type ManagedChatAttachment,
} from '../../../src/network/chat-attach.js';

class MockManagedChatWebSocket extends EventTarget {
  static instances: MockManagedChatWebSocket[] = [];

  readonly send = vi.fn();
  readonly close = vi.fn();
  readonly url: string;
  readonly protocols?: string | string[];
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string | URL, protocols?: string | string[]) {
    super();
    this.url = String(url);
    this.protocols = protocols;
    MockManagedChatWebSocket.instances.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (callback) {
      const callbacks = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      callbacks.add(callback);
      this.listeners.set(type, callbacks);
    }
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (callback) {
      this.listeners.get(type)?.delete(callback);
    }
    super.removeEventListener(type, callback, options);
  }

  emitMessage(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function stubRemoteSessionFetch(): void {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ data: { id: 'session-1' } }))
    .mockResolvedValueOnce(Response.json({ data: { ticket: 'ticket-1' } })));
}

function stubManagedChatWebSocket(): void {
  MockManagedChatWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockManagedChatWebSocket);
}

function managedChatAttachment(): ManagedChatAttachment {
  return {
    baseUrl: 'http://127.0.0.1:4242',
    wsUrl: 'ws://127.0.0.1:4242/v1/chat/ws',
  };
}

describe('resolveManagedChatAttachment', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('attaches to managed chat when the managed service is healthy', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));
    const frankenbeastDir = join(workDir, '.fbeast');
    await mkdir(join(frankenbeastDir, 'network'), { recursive: true });

    await writeFile(join(frankenbeastDir, 'network', 'state.json'), JSON.stringify({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 100,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          url: 'http://127.0.0.1:4242',
        },
      ],
    }));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir,
      fetchImpl: async (input) => {
        expect(String(input)).toBe('http://127.0.0.1:4242/health');
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      },
    });

    expect(attachment).toEqual({
      baseUrl: 'http://127.0.0.1:4242',
      wsUrl: 'ws://127.0.0.1:4242/v1/chat/ws',
    });
  });

  it('falls back to standalone chat when the managed service is not healthy', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir: join(workDir, '.fbeast'),
      fetchImpl: async () => new Response('down', { status: 503 }),
    });

    expect(attachment).toBeUndefined();
  });

  it('falls back to standalone chat when the managed service is unreachable', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir: join(workDir, '.fbeast'),
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });

    expect(attachment).toBeUndefined();
  });

  it('ignores stale detached state when healthcheck fails', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));
    const frankenbeastDir = join(workDir, '.fbeast');
    await mkdir(join(frankenbeastDir, 'network'), { recursive: true });
    await writeFile(join(frankenbeastDir, 'network', 'state.json'), JSON.stringify({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 100,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          url: 'http://127.0.0.1:4242',
        },
      ],
    }));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir,
      fetchImpl: async () => new Response('down', { status: 503 }),
    });

    expect(attachment).toBeUndefined();
  });

  it('rejects persisted non-loopback plaintext chat URLs before healthcheck', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));
    const frankenbeastDir = join(workDir, '.fbeast');
    await mkdir(join(frankenbeastDir, 'network'), { recursive: true });
    await writeFile(join(frankenbeastDir, 'network', 'state.json'), JSON.stringify({
      services: [
        {
          id: 'chat-server',
          url: 'http://internal-service:3737',
        },
      ],
    }));

    await expect(resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir,
      fetchImpl: async () => {
        throw new Error('healthcheck should not run for rejected persisted URL');
      },
    })).rejects.toThrow(/https:\/\//);
  });

  it('keeps chat attachment output routed through the package print helper', async () => {
    const source = await readFile(join(process.cwd(), 'src/network/chat-attach.ts'), 'utf-8');
    const directConsoleCall = ['console', 'log'].join('.');

    expect(source).not.toContain(directConsoleCall);
  });

  it('sends approval and rejection responses for managed chat slash commands', () => {
    const send = vi.fn();
    const socket = { send } as unknown as WebSocket;

    __chatAttachTestHooks.sendManagedChatInput(socket, '/approve');
    __chatAttachTestHooks.sendManagedChatInput(socket, '/reject');

    expect(send).toHaveBeenNthCalledWith(1, JSON.stringify({
      type: 'approval.respond',
      approved: true,
    }));
    expect(send).toHaveBeenNthCalledWith(2, JSON.stringify({
      type: 'approval.respond',
      approved: false,
    }));
  });

  it('sends non-command input as a managed chat message', () => {
    const send = vi.fn();
    const socket = { send } as unknown as WebSocket;

    __chatAttachTestHooks.sendManagedChatInput(socket, 'hello beast');

    expect(JSON.parse(send.mock.calls[0]?.[0] as string)).toMatchObject({
      type: 'message.send',
      content: 'hello beast',
    });
  });

  it('rejects malformed websocket frames while waiting for session readiness', async () => {
    stubRemoteSessionFetch();
    stubManagedChatWebSocket();

    const session = __chatAttachTestHooks.createRemoteSession(managedChatAttachment(), 'project-1');
    await vi.waitFor(() => expect(MockManagedChatWebSocket.instances).toHaveLength(1));
    const socket = MockManagedChatWebSocket.instances[0];
    expect(socket?.listenerCount('message')).toBe(1);

    const rejection = expect(session).rejects.toThrow('Invalid managed chat websocket message during session readiness');
    socket?.emitMessage('{not-json');

    await rejection;
    expect(socket?.listenerCount('message')).toBe(0);
    expect(socket?.listenerCount('error')).toBe(0);
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it('times out instead of waiting indefinitely for session readiness', async () => {
    vi.useFakeTimers();
    stubRemoteSessionFetch();
    stubManagedChatWebSocket();

    const session = __chatAttachTestHooks.createRemoteSession(managedChatAttachment(), 'project-1');
    await vi.waitFor(() => expect(MockManagedChatWebSocket.instances).toHaveLength(1));
    const socket = MockManagedChatWebSocket.instances[0];

    const rejection = expect(session).rejects.toThrow('Timed out waiting for managed chat session readiness');
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(socket?.listenerCount('message')).toBe(0);
    expect(socket?.listenerCount('error')).toBe(0);
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed websocket frames while waiting for a reply', async () => {
    stubManagedChatWebSocket();
    const socket = new MockManagedChatWebSocket('ws://127.0.0.1:4242/v1/chat/ws');

    const reply = __chatAttachTestHooks.awaitRemoteReply(socket as unknown as WebSocket, false);
    expect(socket.listenerCount('message')).toBe(1);

    socket.emitMessage('{not-json');

    await expect(reply).rejects.toThrow('Invalid managed chat websocket message during reply handling');
    expect(socket.listenerCount('message')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
  });

  it('resolves with real token usage and truncation when the server reports them', async () => {
    stubManagedChatWebSocket();
    const socket = new MockManagedChatWebSocket('ws://127.0.0.1:4242/v1/chat/ws');

    const reply = __chatAttachTestHooks.awaitRemoteReply(socket as unknown as WebSocket, false);
    socket.emitMessage(JSON.stringify({
      type: 'assistant.message.complete',
      messageId: 'm1',
      content: 'hello',
      usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
      truncated: true,
      timestamp: new Date().toISOString(),
    }));

    await expect(reply).resolves.toEqual({
      usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
      truncated: true,
    });
  });

  it('resolves with an empty outcome when the server has not opted the peer into usage-stats', async () => {
    stubManagedChatWebSocket();
    const socket = new MockManagedChatWebSocket('ws://127.0.0.1:4242/v1/chat/ws');

    const reply = __chatAttachTestHooks.awaitRemoteReply(socket as unknown as WebSocket, false);
    socket.emitMessage(JSON.stringify({
      type: 'assistant.message.complete',
      messageId: 'm1',
      content: 'hello',
      timestamp: new Date().toISOString(),
    }));

    await expect(reply).resolves.toEqual({});
  });

  it('resolves with real provider context reflecting a server-side fallback', async () => {
    stubManagedChatWebSocket();
    const socket = new MockManagedChatWebSocket('ws://127.0.0.1:4242/v1/chat/ws');

    const reply = __chatAttachTestHooks.awaitRemoteReply(socket as unknown as WebSocket, false);
    socket.emitMessage(JSON.stringify({
      type: 'assistant.message.complete',
      messageId: 'm1',
      content: 'Running on claude now.',
      providerContext: { provider: 'claude', model: 'claude-sonnet-4-6', switchedFrom: 'codex', switchReason: 'rate_limited' },
      timestamp: new Date().toISOString(),
    }));

    await expect(reply).resolves.toEqual({
      providerContext: { provider: 'claude', model: 'claude-sonnet-4-6', switchedFrom: 'codex', switchReason: 'rate_limited' },
    });
  });

  it('ignores a malformed providerContext payload rather than throwing', async () => {
    stubManagedChatWebSocket();
    const socket = new MockManagedChatWebSocket('ws://127.0.0.1:4242/v1/chat/ws');

    const reply = __chatAttachTestHooks.awaitRemoteReply(socket as unknown as WebSocket, false);
    socket.emitMessage(JSON.stringify({
      type: 'assistant.message.complete',
      messageId: 'm1',
      content: 'hello',
      providerContext: { model: 'claude-sonnet-4-6' }, // missing required `provider`
      timestamp: new Date().toISOString(),
    }));

    await expect(reply).resolves.toEqual({});
  });
});

describe('createRemoteSession websocket URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opts into both message-kind and usage-stats features', async () => {
    stubRemoteSessionFetch();
    stubManagedChatWebSocket();

    void __chatAttachTestHooks.createRemoteSession(managedChatAttachment(), 'project-1');
    await vi.waitFor(() => expect(MockManagedChatWebSocket.instances).toHaveLength(1));

    const socket = MockManagedChatWebSocket.instances[0]!;
    const url = new URL(socket.url);
    expect(url.searchParams.get('features')).toBe('message-kind,usage-stats');
  });
});
