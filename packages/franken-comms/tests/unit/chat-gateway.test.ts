import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { ChatGateway } from '../../src/gateway/chat-gateway.js';
import type { ChannelAdapter, ChannelOutboundMessage } from '../../src/core/types.js';

describe('ChatGateway', () => {
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

  it('relays inbound messages to the orchestrator', async () => {
    const gateway = new ChatGateway({
      orchestratorWsUrl: `ws://localhost:${port}`,
    });

    const orchestratorReceived = new Promise<void>((resolve) => {
      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          const event = JSON.parse(data.toString());
          if (event.type === 'message.send' && event.content === 'ping') {
            resolve();
          }
        });
      });
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

    await orchestratorReceived;
    gateway.close();
  });

  it('relays assistant messages back to the channel adapter', async () => {
    const gateway = new ChatGateway({
      orchestratorWsUrl: `ws://localhost:${port}`,
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

    const bridgeConnected = new Promise<void>((resolve) => {
      wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
          type: 'assistant.message.complete',
          messageId: 'AM1',
          content: 'pong',
          timestamp: new Date().toISOString(),
        }));
        resolve();
      });
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

    await bridgeConnected;
    
    // Wait for the event to be processed and adapter.send to be called
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAdapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: 'pong', status: 'reply' })
    );

    gateway.close();
  });
});
