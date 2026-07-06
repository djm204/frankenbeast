import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBeastServices } from '../../../src/beasts/create-beast-services.js';
import { startChatServer } from '../../../src/http/chat-server.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import {
  CHAT_SOCKET_PROTOCOL,
  CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX,
} from '../../../src/http/ws-chat-server.js';
import {
  DASHBOARD_OPERATOR_TOKEN,
  MISMATCH_BEAST_OPERATOR_TOKEN,
  MISMATCH_CHAT_OPERATOR_TOKEN,
  SHARED_OPERATOR_TOKEN,
} from '../__fixtures__/operator-test-tokens.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/chat-server');

function waitForSocketEvent(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for websocket event '${type}'`));
    }, 2_000);

    const onMessage = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      if (payload.type === type) {
        clearTimeout(timeout);
        socket.removeEventListener('message', onMessage);
        resolve(payload);
      }
    };

    socket.addEventListener('message', onMessage);
  });
}

function waitForSocketClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for websocket close'));
    }, 2_000);
    socket.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

describe('chat server bootstrap', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('serves HTTP sessions and websocket upgrades from the same live server', async () => {
    mkdirSync(TMP, { recursive: true });
    const llm = { complete: vi.fn().mockResolvedValue('Server reply') };
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: TMP,
      llm,
      projectName: 'test-project',
    });

    try {
      const createRes = await fetch(`${server.url}/v1/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj' }),
      });
      expect(createRes.status).toBe(201);

      const body = await createRes.json() as {
        data: {
          id: string;
          socketToken: string;
        };
      };

      const socket = new WebSocket(
        `${server.wsUrl}?sessionId=${encodeURIComponent(body.data.id)}`,
        [CHAT_SOCKET_PROTOCOL, `${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${body.data.socketToken}`],
      );
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', (event) => reject(event.error ?? new Error('websocket error')), { once: true });
      });

      const ready = await waitForSocketEvent(socket, 'session.ready');
      expect(ready.type).toBe('session.ready');

      socket.send(JSON.stringify({
        type: 'message.send',
        clientMessageId: 'client-1',
        content: 'hello from the browser',
      }));

      const reply = await waitForSocketEvent(socket, 'assistant.message.complete');
      expect(reply.type).toBe('assistant.message.complete');
      expect(reply.content).toBe('Server reply');
      socket.close();
    } finally {
      await server.close();
    }
  });

  it('removes websocket upgrade listeners and closes active sockets on shutdown', async () => {
    mkdirSync(TMP, { recursive: true });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
    });

    const createRes = await fetch(`${server.url}/v1/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    expect(createRes.status).toBe(201);
    const body = await createRes.json() as {
      data: {
        id: string;
        socketToken: string;
      };
    };
    const socket = new WebSocket(
      `${server.wsUrl}?sessionId=${encodeURIComponent(body.data.id)}`,
      [CHAT_SOCKET_PROTOCOL, `${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${body.data.socketToken}`],
    );
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', (event) => reject(event.error ?? new Error('websocket error')), { once: true });
    });

    expect(server.server.listenerCount('upgrade')).toBe(1);

    await server.close();
    await waitForSocketClose(socket);

    expect(server.server.listenerCount('upgrade')).toBe(0);
  });

  it('mounts beast routes on the live server when beast control is configured', async () => {
    mkdirSync(TMP, { recursive: true });
    const llm = { complete: vi.fn().mockResolvedValue('Server reply') };
    const beastServices = createBeastServices({
      beastsDb: join(TMP, 'beasts.db'),
      beastLogsDir: join(TMP, 'beast-logs'),
    });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: join(TMP, 'chat'),
      llm,
      projectName: 'test-project',
      beastControl: {
        ...beastServices,
        security: new TransportSecurityService(),
        operatorToken: DASHBOARD_OPERATOR_TOKEN,
        rateLimit: {
          windowMs: 60_000,
          max: 20,
        },
      },
    });

    try {
      const response = await fetch(`${server.url}/v1/beasts/catalog`, {
        headers: {
          authorization: ['Bearer', DASHBOARD_OPERATOR_TOKEN].join(' '),
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { data: Array<{ id: string }> };
      expect(body.data.map((entry) => entry.id)).toEqual([
        'design-interview',
        'chunk-plan',
        'martin-loop',
      ]);
    } finally {
      await server.close();
    }
  });

  it('mounts comms health and generic inbound routes on the live chat server', async () => {
    mkdirSync(TMP, { recursive: true });
    const llm = { complete: vi.fn().mockResolvedValue('Comms reply') };
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: TMP,
      llm,
      projectName: 'test-project',
      commsConfig: {
        orchestrator: {},
        channels: {},
      },
    });

    try {
      const health = await fetch(`${server.url}/comms/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ status: 'ok' });

      const inbound = await fetch(`${server.url}/v1/comms/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'slack',
          externalUserId: 'U123',
          externalChannelId: 'C456',
          externalThreadId: 'T789',
          externalMessageId: 'M001',
          text: 'run status',
          rawEvent: {},
          receivedAt: new Date().toISOString(),
        }),
      });

      expect(inbound.status).toBe(200);
      await expect(inbound.json()).resolves.toEqual({ accepted: true });
    } finally {
      await server.close();
    }
  });

  it('refuses to start when chat is exposed (managed mode) without an operator token', async () => {
    mkdirSync(TMP, { recursive: true });
    const prev = process.env['FRANKENBEAST_NETWORK_MANAGED'];
    process.env['FRANKENBEAST_NETWORK_MANAGED'] = '1';
    try {
      await expect(startChatServer({
        host: '127.0.0.1', // loopback alone is not enough in managed mode
        port: 0,
        sessionStoreDir: TMP,
        llm: { complete: vi.fn().mockResolvedValue('') },
        projectName: 'test-project',
      })).rejects.toThrow(/operator token/i);
    } finally {
      if (prev === undefined) delete process.env['FRANKENBEAST_NETWORK_MANAGED'];
      else process.env['FRANKENBEAST_NETWORK_MANAGED'] = prev;
    }
  });

  it('refuses to start when chat and beast operator tokens differ', async () => {
    mkdirSync(TMP, { recursive: true });
    const beastServices = createBeastServices({
      beastsDb: join(TMP, 'beasts.db'),
      beastLogsDir: join(TMP, 'beast-logs'),
    });
    try {
      await expect(startChatServer({
        host: '127.0.0.1',
        port: 0,
        sessionStoreDir: join(TMP, 'chat'),
        llm: { complete: vi.fn().mockResolvedValue('') },
        projectName: 'test-project',
        operatorToken: MISMATCH_CHAT_OPERATOR_TOKEN,
        beastControl: {
          ...beastServices,
          security: new TransportSecurityService(),
          operatorToken: MISMATCH_BEAST_OPERATOR_TOKEN,
          rateLimit: { windowMs: 60_000, max: 20 },
        },
      })).rejects.toThrow(/different operator tokens/i);
    } finally {
      beastServices.ticketStore.destroy();
    }
  });

  it('starts when chat and beast operator tokens match', async () => {
    mkdirSync(TMP, { recursive: true });
    const beastServices = createBeastServices({
      beastsDb: join(TMP, 'beasts.db'),
      beastLogsDir: join(TMP, 'beast-logs'),
    });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
      operatorToken: SHARED_OPERATOR_TOKEN,
      beastControl: {
        ...beastServices,
        security: new TransportSecurityService(),
        operatorToken: SHARED_OPERATOR_TOKEN,
        rateLimit: { windowMs: 60_000, max: 20 },
      },
    });
    try {
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('stops local beast-control runs before closing', async () => {
    mkdirSync(TMP, { recursive: true });
    const beastServices = createBeastServices({
      beastsDb: join(TMP, 'beasts.db'),
      beastLogsDir: join(TMP, 'beast-logs'),
    });
    const run = await beastServices.dispatch.createRun({
      definitionId: 'design-interview',
      config: {
        goal: 'Close safely',
        outputPath: 'docs/design.md',
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      startNow: false,
    });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
      operatorToken: SHARED_OPERATOR_TOKEN,
      beastControl: {
        ...beastServices,
        security: new TransportSecurityService(),
        operatorToken: SHARED_OPERATOR_TOKEN,
        rateLimit: { windowMs: 60_000, max: 20 },
      },
    });

    await server.close();

    expect(beastServices.runs.getRun(run.id).status).toBe('stopped');
    beastServices.dispose();
  });

  it('force-closes active SSE clients on shutdown', async () => {
    mkdirSync(TMP, { recursive: true });
    const beastServices = createBeastServices({
      beastsDb: join(TMP, 'beasts.db'),
      beastLogsDir: join(TMP, 'beast-logs'),
    });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: join(TMP, 'chat'),
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
      operatorToken: SHARED_OPERATOR_TOKEN,
      beastControl: {
        ...beastServices,
        security: new TransportSecurityService(),
        operatorToken: SHARED_OPERATOR_TOKEN,
        rateLimit: { windowMs: 60_000, max: 20 },
      },
    });

    const ticketResponse = await fetch(`${server.url}/v1/beasts/events/ticket`, {
      method: 'POST',
      headers: {
        authorization: ['Bearer', SHARED_OPERATOR_TOKEN].join(' '),
      },
    });
    expect(ticketResponse.status).toBe(200);
    const ticketBody = await ticketResponse.json() as { ticket: string };
    const streamResponse = await fetch(`${server.url}/v1/beasts/events/stream?ticket=${ticketBody.ticket}`, {
      headers: {
        authorization: ['Bearer', SHARED_OPERATOR_TOKEN].join(' '),
      },
    });
    expect(streamResponse.status).toBe(200);

    await expect(Promise.race([
      server.close().then(() => 'closed'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 1_000)),
    ])).resolves.toBe('closed');
    beastServices.dispose();
  });

  it('refuses to start on a non-loopback host before binding', async () => {
    mkdirSync(TMP, { recursive: true });
    await expect(startChatServer({
      host: '0.0.0.0',
      port: 0,
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
      operatorToken: SHARED_OPERATOR_TOKEN,
    })).rejects.toThrow(/non-loopback host/);
  });

  it('starts on loopback without a token (dev mode)', async () => {
    mkdirSync(TMP, { recursive: true });
    const server = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('') },
      projectName: 'test-project',
    });
    try {
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
