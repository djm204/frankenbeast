import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerSocketEvent } from '@franken/types';

function getMockSockets(): Array<{
  url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => boolean;
}> {
  const state = globalThis as typeof globalThis & {
    __frankenMockSockets?: Array<{
      url: string;
      readyState: number;
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      emit: (event: string, ...args: unknown[]) => boolean;
    }>;
  };
  state.__frankenMockSockets ??= [];
  return state.__frankenMockSockets;
}

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');

  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    readonly url: string;
    readyState = MockWebSocket.OPEN;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 3;
      this.emit('close');
    });

    constructor(url: string) {
      super();
      this.url = url;
      getMockSockets().push(this);
      queueMicrotask(() => this.emit('open'));
    }
  }

  return { WebSocket: MockWebSocket };
});

import { ChatSocketBridge } from '../../src/core/chat-socket-bridge.js';

describe('ChatSocketBridge', () => {
  beforeEach(() => {
    getMockSockets().length = 0;
  });

  it('connects to the server with sessionId', async () => {
    const bridge = new ChatSocketBridge({
      url: 'ws://orchestrator.test/socket',
      sessionId: 'session-123',
    });

    await bridge.connect();

    expect(getMockSockets()).toHaveLength(1);
    expect(getMockSockets()[0].url).toContain('sessionId=session-123');
    bridge.close();
  });

  it('receives events from the server', async () => {
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
    getMockSockets()[0].emit('message', Buffer.from(JSON.stringify(event)));
    await eventPromise;
    bridge.close();
  });

  it('sends messages to the server', async () => {
    const bridge = new ChatSocketBridge({
      url: 'ws://orchestrator.test/socket',
      sessionId: 'session-123',
    });

    await bridge.connect();
    await bridge.send('hello');

    expect(getMockSockets()[0].send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(getMockSockets()[0].send.mock.calls[0][0] as string);
    expect(payload.type).toBe('message.send');
    expect(payload.content).toBe('hello');
    bridge.close();
  });
});
