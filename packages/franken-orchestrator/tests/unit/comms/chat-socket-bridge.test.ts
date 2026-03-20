import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerSocketEvent } from '@franken/types';

interface MockSocket {
  url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  listeners: Map<string, Array<(ev: unknown) => void>>;
  addEventListener(type: string, fn: (ev: unknown) => void): void;
  removeEventListener(type: string, fn: (ev: unknown) => void): void;
  dispatchEvent(type: string, data?: unknown): void;
}

function createMockSockets(): { sockets: MockSocket[]; cleanup: () => void } {
  const sockets: MockSocket[] = [];
  const OriginalWebSocket = globalThis.WebSocket;

  class MockWebSocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;

    url: string;
    readyState = 1;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 3;
      this.dispatchEvent('close');
    });
    listeners = new Map<string, Array<(ev: unknown) => void>>();

    constructor(url: string | URL) {
      this.url = String(url);
      sockets.push(this as unknown as MockSocket);
      queueMicrotask(() => this.dispatchEvent('open'));
    }

    addEventListener(type: string, fn: (ev: unknown) => void): void {
      const list = this.listeners.get(type) ?? [];
      list.push(fn);
      this.listeners.set(type, list);
    }

    removeEventListener(type: string, fn: (ev: unknown) => void): void {
      const list = this.listeners.get(type) ?? [];
      this.listeners.set(type, list.filter((f) => f !== fn));
    }

    dispatchEvent(type: string, data?: unknown): void {
      const list = this.listeners.get(type) ?? [];
      for (const fn of list) {
        fn(data !== undefined ? { data } : {});
      }
    }
  }

  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

  return {
    sockets,
    cleanup: () => {
      globalThis.WebSocket = OriginalWebSocket;
    },
  };
}

describe('ChatSocketBridge', () => {
  let sockets: MockSocket[];
  let cleanup: () => void;

  beforeEach(() => {
    const mock = createMockSockets();
    sockets = mock.sockets;
    cleanup = mock.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('connects to the server with sessionId', async () => {
    const { ChatSocketBridge } = await import('../../../src/comms/core/chat-socket-bridge.js');
    const bridge = new ChatSocketBridge({
      url: 'ws://orchestrator.test/socket',
      sessionId: 'session-123',
    });

    await bridge.connect();

    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toContain('sessionId=session-123');
    bridge.close();
  });

  it('receives events from the server', async () => {
    const { ChatSocketBridge } = await import('../../../src/comms/core/chat-socket-bridge.js');
    const bridge = new ChatSocketBridge({
      url: 'ws://orchestrator.test/socket',
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
    sockets[0]!.dispatchEvent('message', JSON.stringify(event));
    await eventPromise;
    bridge.close();
  });

  it('sends messages to the server', async () => {
    const { ChatSocketBridge } = await import('../../../src/comms/core/chat-socket-bridge.js');
    const bridge = new ChatSocketBridge({
      url: 'ws://orchestrator.test/socket',
      sessionId: 'session-123',
    });

    await bridge.connect();
    await bridge.send('hello');

    expect(sockets[0]!.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sockets[0]!.send.mock.calls[0]![0] as string);
    expect(payload.type).toBe('message.send');
    expect(payload.content).toBe('hello');
    bridge.close();
  });
});
