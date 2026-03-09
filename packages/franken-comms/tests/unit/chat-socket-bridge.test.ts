import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatSocketBridge } from '../../src/core/chat-socket-bridge.js';
import type { ServerSocketEvent } from '../../../franken-orchestrator/src/http/ws-chat-types.js';

describe('ChatSocketBridge', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
    port = (wss.address() as any).port;
  });

  afterEach(() => {
    wss.close();
  });

  it('connects to the server with sessionId', async () => {
    const bridge = new ChatSocketBridge({
      url: `ws://localhost:${port}`,
      sessionId: 'session-123',
    });

    const connectPromise = new Promise<void>((resolve) => {
      wss.on('connection', (ws, req) => {
        const url = new URL(req.url!, 'http://localhost');
        expect(url.searchParams.get('sessionId')).toBe('session-123');
        resolve();
      });
    });

    await bridge.connect();
    await connectPromise;
    bridge.close();
  });

  it('receives events from the server', async () => {
    const bridge = new ChatSocketBridge({
      url: `ws://localhost:${port}`,
      sessionId: 'session-123',
    });

    const event: ServerSocketEvent = {
      type: 'session.ready',
      sessionId: 'session-123',
      projectId: 'project-456',
      transcript: [],
      state: 'idle',
    };

    const eventPromise = new Promise<void>((resolve) => {
      bridge.on('session.ready', (data) => {
        expect(data).toEqual(event);
        resolve();
      });
    });

    await bridge.connect();
    wss.clients.forEach((client) => client.send(JSON.stringify(event)));
    await eventPromise;
    bridge.close();
  });

  it('sends messages to the server', async () => {
    const bridge = new ChatSocketBridge({
      url: `ws://localhost:${port}`,
      sessionId: 'session-123',
    });

    const messagePromise = new Promise<void>((resolve) => {
      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          const payload = JSON.parse(data.toString());
          expect(payload.type).toBe('message.send');
          expect(payload.content).toBe('hello');
          resolve();
        });
      });
    });

    await bridge.connect();
    await bridge.send('hello');
    await messagePromise;
    bridge.close();
  });
});
