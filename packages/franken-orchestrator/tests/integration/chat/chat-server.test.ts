import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBeastServices } from '../../../src/beasts/create-beast-services.js';
import { startChatServer } from '../../../src/http/chat-server.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

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

      const socket = new WebSocket(`${server.wsUrl}?sessionId=${body.data.id}&token=${body.data.socketToken}`);
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
        operatorToken: 'dashboard-operator-token',
        rateLimit: {
          windowMs: 60_000,
          max: 20,
        },
      },
    });

    try {
      const response = await fetch(`${server.url}/v1/beasts/catalog`, {
        headers: {
          authorization: 'Bearer dashboard-operator-token',
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
});
