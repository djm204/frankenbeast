import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { FileSessionStore } from '../../../src/chat/session-store.js';
import { TurnRunner } from '../../../src/chat/turn-runner.js';
import { ChatRuntime } from '../../../src/chat/runtime.js';
import {
  CHAT_SOCKET_PROTOCOL,
  CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX,
  ChatSocketController,
  attachChatWebSocketServer,
} from '../../../src/http/ws-chat-server.js';
import {
  createSessionTokenSecret,
  issueSessionToken,
} from '../../../src/http/ws-chat-auth.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/ws-chat');

function createPeer() {
  const sent: string[] = [];
  return {
    peer: {
      close: vi.fn(),
      send: (data: string) => sent.push(data),
    },
    sent,
  };
}

function createTestRuntime(
  llmComplete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue('Working on it right now.'),
): ChatRuntime {
  return new ChatRuntime({
    engine: new ConversationEngine({
      llm: { complete: llmComplete },
      projectName: 'proj',
    }),
    turnRunner: new TurnRunner({
      execute: vi.fn().mockResolvedValue({
        status: 'success',
        summary: 'Done',
        filesChanged: [],
        testsRun: 0,
        errors: [],
      }),
    }),
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP listener address');
      }
      resolve(address.port);
    });
  });
}

function onceSocket(socket: WebSocket, event: 'open' | 'close' | 'error'): Promise<unknown[]> {
  return new Promise((resolve) => {
    socket.once(event, (...args: unknown[]) => resolve(args));
  });
}

describe('ws chat server', () => {
  it('accepts upgrade requests with socket tokens in websocket subprotocols', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const httpServer = createServer();
    attachChatWebSocketServer({
      runtime: createTestRuntime(),
      sessionStore: store,
      tokenSecret: secret,
      server: httpServer,
    });
    const port = await listen(httpServer);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/v1/chat/ws?sessionId=${encodeURIComponent(session.id)}`,
      [CHAT_SOCKET_PROTOCOL, `${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${token}`],
    );

    await expect(onceSocket(socket, 'open')).resolves.toEqual([]);
    expect(socket.protocol).toBe(CHAT_SOCKET_PROTOCOL);
    expect(socket.url).not.toContain(token);

    socket.close();
    httpServer.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  it('does not negotiate token pseudo-protocols when clients send them first', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const httpServer = createServer();
    attachChatWebSocketServer({
      runtime: createTestRuntime(),
      sessionStore: store,
      tokenSecret: secret,
      server: httpServer,
    });
    const port = await listen(httpServer);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/v1/chat/ws?sessionId=${encodeURIComponent(session.id)}`,
      [`${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${token}`, CHAT_SOCKET_PROTOCOL],
    );

    await expect(onceSocket(socket, 'open')).resolves.toEqual([]);
    expect(socket.protocol).toBe(CHAT_SOCKET_PROTOCOL);
    expect(socket.protocol).not.toContain(token);

    socket.close();
    httpServer.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects upgrade requests that still pass socket tokens in query strings', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const httpServer = createServer();
    attachChatWebSocketServer({
      runtime: createTestRuntime(),
      sessionStore: store,
      tokenSecret: secret,
      server: httpServer,
    });
    const port = await listen(httpServer);
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/v1/chat/ws?sessionId=${encodeURIComponent(session.id)}&token=${encodeURIComponent(token)}`,
    );

    await onceSocket(socket, 'error');
    expect(socket.readyState).toBe(WebSocket.CLOSED);

    httpServer.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  it('emits typing, delta, and complete events for a reply turn', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const runtime = new ChatRuntime({
      engine: new ConversationEngine({
        llm: { complete: vi.fn().mockResolvedValue('Working on it right now.') },
        projectName: 'proj',
      }),
      turnRunner: new TurnRunner({
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: 'Done',
          filesChanged: [],
          testsRun: 0,
          errors: [],
        }),
      }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    const connect = controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    });
    expect(connect.ok).toBe(true);

    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-1',
      content: 'Explain the routing logic',
    }));

    const events = sent.map((raw) => JSON.parse(raw) as { type: string });
    expect(events.map((event) => event.type)).toContain('assistant.typing.start');
    expect(events.map((event) => event.type)).toContain('assistant.message.delta');
    expect(events.map((event) => event.type)).toContain('assistant.message.complete');

    rmSync(TMP, { recursive: true, force: true });
  });

  it('rate limits websocket message floods before runtime execution', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const llmComplete = vi.fn().mockResolvedValue('Working on it right now.');
    const controller = new ChatSocketController({
      runtime: createTestRuntime(llmComplete),
      sessionStore: store,
      tokenSecret: secret,
      chatMessageRateLimit: { max: 1, windowMs: 60_000 },
    });
    const { peer, sent } = createPeer();

    const connect = controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    });
    expect(connect.ok).toBe(true);

    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-1',
      content: 'first message',
    }));
    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-2',
      content: 'second message',
    }));

    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(llmComplete).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.error',
      code: 'RATE_LIMITED',
      message: 'WebSocket chat message rate limit exceeded.',
    }));

    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects overlapping websocket turns before starting another runtime execution', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    let resolveLlm!: (value: string) => void;
    const llmPending = new Promise<string>((resolve) => {
      resolveLlm = resolve;
    });
    const llmComplete = vi.fn().mockReturnValue(llmPending);
    const controller = new ChatSocketController({
      runtime: createTestRuntime(llmComplete),
      sessionStore: store,
      tokenSecret: secret,
      chatMessageRateLimit: { max: 10, windowMs: 60_000 },
    });
    const { peer, sent } = createPeer();

    const connect = controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    });
    expect(connect.ok).toBe(true);

    const firstReceive = controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-1',
      content: 'first message',
    }));
    await vi.waitFor(() => expect(llmComplete).toHaveBeenCalledTimes(1));

    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-2',
      content: 'second message',
    }));

    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(llmComplete).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.error',
      code: 'RATE_LIMITED',
      message: 'A chat turn is already running for this websocket connection.',
    }));

    resolveLlm('Working on it right now.');
    await firstReceive;
    rmSync(TMP, { recursive: true, force: true });
  });

  it('emits approval context for execution turns that require approval', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const engine = {
      processTurn: vi.fn().mockResolvedValue({
        tier: 'premium_execution',
        newMessages: [],
        outcome: {
          kind: 'execute',
          taskDescription: 'deploy staging',
          approvalRequired: true,
        },
      }),
    };
    const runtime = new ChatRuntime({
      engine: engine as unknown as ConversationEngine,
      turnRunner: new TurnRunner({
        execute: vi.fn(),
      }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    const connect = controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    });
    expect(connect.ok).toBe(true);

    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-1',
      content: 'deploy staging',
    }));

    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.approval.requested',
      description: 'deploy staging',
      tool: 'execution',
      command: 'deploy staging',
      risk: 'Requires explicit approval before execution.',
      sessionId: session.id,
    }));
    expect(store.get(session.id)?.pendingApproval).toEqual(expect.objectContaining({
      description: 'deploy staging',
      tool: 'execution',
      command: 'deploy staging',
      risk: 'Requires explicit approval before execution.',
      sessionId: session.id,
    }));

    rmSync(TMP, { recursive: true, force: true });
  });
});
