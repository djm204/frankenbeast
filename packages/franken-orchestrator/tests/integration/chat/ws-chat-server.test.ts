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

function createTestRuntime(): ChatRuntime {
  return new ChatRuntime({
    engine: new ConversationEngine({
      llm: { complete: vi.fn().mockResolvedValue('Working on it right now.') },
      projectName: 'proj',
    }),
    turnRunner: new TurnRunner({
      execute: vi.fn().mockResolvedValue({
        status: 'success' as const,
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
          status: 'success' as const,
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

  it('emits execution events after an approved action runs', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    session.state = 'pending_approval';
    session.pendingApproval = {
      description: 'deploy staging',
      requestedAt: '2026-03-09T00:00:00Z',
      tool: 'execution',
      command: 'deploy staging',
      sessionId: session.id,
    };
    store.save(session);
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const execute = vi.fn().mockResolvedValue({
      status: 'success' as const,
      summary: 'Done',
      filesChanged: [],
      testsRun: 0,
      errors: [],
    });
    const runtime = new ChatRuntime({
      engine: { processTurn: vi.fn() } as unknown as ConversationEngine,
      turnRunner: new TurnRunner({ execute }),
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
      type: 'approval.respond',
      approved: true,
    }));

    expect(execute).toHaveBeenCalledWith({ userInput: 'deploy staging' });
    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.approval.resolved',
      approved: true,
    }));
    expect(events.findIndex((event) => event.type === 'turn.approval.resolved'))
      .toBeLessThan(events.findIndex((event) => event.type === 'turn.execution.start'));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.execution.start',
      data: { taskDescription: 'deploy staging' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.execution.complete',
      data: { status: 'success' },
    }));
    expect(store.get(session.id)?.state).toBe('approved');
    expect(store.get(session.id)?.pendingApproval).toBeNull();

    rmSync(TMP, { recursive: true, force: true });
  });

  it('does not execute the same approved action twice for duplicate approval frames', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    session.state = 'pending_approval';
    session.pendingApproval = {
      description: 'deploy staging',
      requestedAt: '2026-03-09T00:00:00Z',
      tool: 'execution',
      command: 'deploy staging',
      sessionId: session.id,
    };
    store.save(session);
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    let finishExecution!: () => void;
    const executionStarted = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    const execute = vi.fn(async () => {
      await executionStarted;
      return {
        status: 'success' as const,
        summary: 'Done',
        filesChanged: [],
        testsRun: 0,
        errors: [],
      };
    });
    const runtime = new ChatRuntime({
      engine: { processTurn: vi.fn() } as unknown as ConversationEngine,
      turnRunner: new TurnRunner({ execute }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    expect(controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    }).ok).toBe(true);

    const first = controller.receive(peer, JSON.stringify({
      type: 'approval.respond',
      approved: true,
    }));
    const second = controller.receive(peer, JSON.stringify({
      type: 'approval.respond',
      approved: true,
    }));
    finishExecution();
    await Promise.all([first, second]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.get(session.id)?.state).toBe('approved');
    expect(store.get(session.id)?.pendingApproval).toBeNull();
    const executionStarts = sent
      .map((raw) => JSON.parse(raw) as { type: string })
      .filter((event) => event.type === 'turn.execution.start');
    expect(executionStarts).toHaveLength(1);
    const approvalResolved = sent
      .map((raw) => JSON.parse(raw) as { type: string })
      .filter((event) => event.type === 'turn.approval.resolved');
    expect(approvalResolved).toHaveLength(2);

    rmSync(TMP, { recursive: true, force: true });
  });

  it('restores pending approval and notifies clients when approved execution throws', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    session.state = 'pending_approval';
    session.pendingApproval = {
      description: 'deploy staging',
      requestedAt: '2026-03-09T00:00:00Z',
      tool: 'execution',
      command: 'deploy staging',
      sessionId: session.id,
    };
    store.save(session);
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const execute = vi.fn(async () => {
      throw new Error('executor offline');
    });
    const runtime = new ChatRuntime({
      engine: { processTurn: vi.fn() } as unknown as ConversationEngine,
      turnRunner: new TurnRunner({ execute }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    expect(controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    }).ok).toBe(true);

    await expect(controller.receive(peer, JSON.stringify({
      type: 'approval.respond',
      approved: true,
    }))).resolves.toBeUndefined();

    expect(store.get(session.id)?.state).toBe('pending_approval');
    expect(store.get(session.id)?.pendingApproval?.command).toBe('deploy staging');
    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.error',
      code: 'APPROVAL_EXECUTION_FAILED',
      message: 'executor offline',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.approval.requested',
      command: 'deploy staging',
    }));

    rmSync(TMP, { recursive: true, force: true });
  });

  it('uses the legacy approve command for approvals without executable commands', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    session.state = 'pending_approval';
    session.pendingApproval = {
      description: 'Approve deployment?',
      requestedAt: '2026-03-09T00:00:00Z',
      tool: 'execution',
      sessionId: session.id,
    };
    store.save(session);
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const execute = vi.fn();
    const runtime = new ChatRuntime({
      engine: { processTurn: vi.fn() } as unknown as ConversationEngine,
      turnRunner: new TurnRunner({ execute }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    expect(controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    }).ok).toBe(true);

    await controller.receive(peer, JSON.stringify({
      type: 'approval.respond',
      approved: true,
    }));

    expect(execute).not.toHaveBeenCalled();
    const events = sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'assistant.message.complete',
      content: 'Approved.',
    }));

    rmSync(TMP, { recursive: true, force: true });
  });
});
