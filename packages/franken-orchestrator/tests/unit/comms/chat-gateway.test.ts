import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelAdapter } from '../../../src/comms/core/types.js';
import type { CommsRuntimePort, CommsInboundResult } from '../../../src/comms/core/comms-runtime-port.js';
import { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';

function mockRuntime(): CommsRuntimePort {
  return {
    processInbound: vi.fn().mockResolvedValue({
      text: 'pong',
      status: 'reply',
    } satisfies CommsInboundResult),
  };
}

function mockAdapter(type: 'slack' | 'discord' | 'telegram' | 'whatsapp'): ChannelAdapter {
  return {
    type,
    capabilities: {
      threads: true,
      buttons: true,
      slashCommands: true,
      richBlocks: true,
      fileUpload: true,
      markdownFlavor: type === 'discord' ? 'discord' : type === 'telegram' ? 'telegram' : type === 'whatsapp' ? 'plain' : 'slack',
    },
    send: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ChatGateway', () => {
  let runtime: CommsRuntimePort;
  let gateway: ChatGateway;

  beforeEach(() => {
    runtime = mockRuntime();
    gateway = new ChatGateway(runtime);
  });

  it('calls runtime.processInbound with mapped session ID', async () => {
    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'ping',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    expect(runtime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: 'slack',
        text: 'ping',
        externalUserId: 'U1',
      }),
    );
    // Session ID should be a deterministic hash
    const call = (runtime.processInbound as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.sessionId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('relays result to the correct channel adapter', async () => {
    const slackAdapter = mockAdapter('slack');
    const discordAdapter = mockAdapter('discord');
    gateway.registerAdapter(slackAdapter);
    gateway.registerAdapter(discordAdapter);

    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'ping',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    expect(slackAdapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: 'pong', status: 'reply' }),
    );
    expect(discordAdapter.send).not.toHaveBeenCalled();
  });

  it('works with all four channel types', async () => {
    for (const type of ['slack', 'discord', 'telegram', 'whatsapp'] as const) {
      const adapter = mockAdapter(type);
      gateway.registerAdapter(adapter);

      await gateway.handleInbound({
        channelType: type,
        externalUserId: `U-${type}`,
        externalChannelId: `C-${type}`,
        externalMessageId: `M-${type}`,
        text: 'test',
        receivedAt: new Date().toISOString(),
        rawEvent: {},
      });

      expect(adapter.send).toHaveBeenCalled();
    }
  });

  it('passes channel routing metadata through to outbound replies', async () => {
    for (const [type, expectedMetadata] of [
      ['telegram', { externalChannelId: 'C-telegram', chatId: 'C-telegram' }],
      ['whatsapp', { externalChannelId: 'C-whatsapp', phoneNumber: 'C-whatsapp' }],
    ] as const) {
      const adapter = mockAdapter(type);
      gateway.registerAdapter(adapter);

      await gateway.handleInbound({
        channelType: type,
        externalUserId: `U-${type}`,
        externalChannelId: `C-${type}`,
        externalMessageId: `M-${type}`,
        text: 'test',
        receivedAt: new Date().toISOString(),
        rawEvent: {},
      });

      expect(adapter.send).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ metadata: expect.objectContaining(expectedMetadata) }),
      );
    }
  });

  it('handleAction sends /approve for approve action', async () => {
    const slackAdapter = mockAdapter('slack');
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'sess-1', 'approve');

    expect(runtime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        text: '/approve',
      }),
    );
  });

  it('handleAction relays explicit route metadata after a restart', async () => {
    const telegramAdapter = mockAdapter('telegram');
    gateway.registerAdapter(telegramAdapter);

    await gateway.handleAction('telegram', 'sess-telegram', 'approve', {
      chatId: 'chat-123',
      externalChannelId: 'chat-123',
    });

    expect(telegramAdapter.send).toHaveBeenCalledWith(
      'sess-telegram',
      expect.objectContaining({
        metadata: expect.objectContaining({ chatId: 'chat-123' }),
      }),
    );
  });

  it('handleAction sends rejection text for reject action', async () => {
    const slackAdapter = mockAdapter('slack');
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'sess-1', 'reject');

    expect(runtime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        text: 'Action rejected by user: reject',
      }),
    );
  });

  it('close() does not throw', () => {
    expect(() => gateway.close()).not.toThrow();
  });
});
