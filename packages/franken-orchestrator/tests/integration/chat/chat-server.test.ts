import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startChatServer } from '../../../src/http/chat-server.js';

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
});
