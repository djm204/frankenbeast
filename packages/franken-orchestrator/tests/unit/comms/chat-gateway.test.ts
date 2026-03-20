import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelAdapter } from '../../../src/comms/core/types.js';

function getBridgeInstances(): Array<{
  options: { url: string; sessionId: string; token?: string | undefined };
  connect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  respondToApproval: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => boolean;
}> {
  const state = globalThis as typeof globalThis & {
    __frankenBridgeInstances?: Array<{
      options: { url: string; sessionId: string; token?: string | undefined };
      connect: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      respondToApproval: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      emit: (event: string, ...args: unknown[]) => boolean;
    }>;
  };
  state.__frankenBridgeInstances ??= [];
  return state.__frankenBridgeInstances;
}

vi.mock('../../../src/comms/core/chat-socket-bridge.js', async () => {
  const { EventEmitter } = await import('node:events');

  class MockChatSocketBridge extends EventEmitter {
    readonly options: { url: string; sessionId: string; token?: string | undefined };
    connect = vi.fn(async () => {});
    send = vi.fn(async () => 'client-message-id');
    respondToApproval = vi.fn(async () => {});
    close = vi.fn();

    constructor(options: { url: string; sessionId: string; token?: string | undefined }) {
      super();
      this.options = options;
      getBridgeInstances().push(this);
    }
  }

  return { ChatSocketBridge: MockChatSocketBridge };
});

import { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';

describe('ChatGateway', () => {
  beforeEach(() => {
    getBridgeInstances().length = 0;
  });

  it('relays inbound messages to the orchestrator', async () => {
    const gateway = new ChatGateway({
      orchestratorWsUrl: 'ws://orchestrator.test/socket',
    });

    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'ping',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    expect(getBridgeInstances()).toHaveLength(1);
    expect(getBridgeInstances()[0].options.url).toBe('ws://orchestrator.test/socket');
    expect(getBridgeInstances()[0].connect).toHaveBeenCalledTimes(1);
    expect(getBridgeInstances()[0].send).toHaveBeenCalledWith('ping');
    gateway.close();
  });

  it('relays assistant messages back to the channel adapter', async () => {
    const gateway = new ChatGateway({
      orchestratorWsUrl: 'ws://orchestrator.test/socket',
    });

    const mockAdapter: ChannelAdapter = {
      type: 'slack',
      capabilities: {
        threads: true,
        buttons: true,
        slashCommands: true,
        richBlocks: true,
        fileUpload: true,
        markdownFlavor: 'slack',
      },
      send: vi.fn().mockResolvedValue(undefined),
    };

    gateway.registerAdapter(mockAdapter);

    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'ping',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    getBridgeInstances()[0].emit('assistant.message.complete', {
      type: 'assistant.message.complete',
      messageId: 'AM1',
      content: 'pong',
      timestamp: new Date().toISOString(),
    });

    expect(mockAdapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: 'pong', status: 'reply' })
    );

    gateway.close();
  });
});
