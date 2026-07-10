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
      ['slack', { externalChannelId: 'C-slack', channelId: 'C-slack' }],
      ['discord', { externalChannelId: 'C-discord', channelId: 'C-discord' }],
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

  it('handleAction relays routing metadata returned by the runtime after a restart', async () => {
    (runtime.processInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'approved',
      status: 'reply',
      metadata: { channelId: 'C-stored', threadTs: '456.789' },
    } satisfies CommsInboundResult);
    const slackAdapter = mockAdapter('slack');
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'sess-slack', 'approve');

    expect(slackAdapter.send).toHaveBeenCalledWith(
      'sess-slack',
      expect.objectContaining({
        metadata: expect.objectContaining({ channelId: 'C-stored', threadTs: '456.789' }),
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

  it('evicts least-recently used route metadata when the session cache reaches its cap', async () => {
    gateway = new ChatGateway(runtime, { routeMetadataMaxEntries: 2 });
    const slackAdapter = mockAdapter('slack');
    gateway.registerAdapter(slackAdapter);

    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'one',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });
    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U2',
      externalChannelId: 'C2',
      externalMessageId: 'M2',
      text: 'two',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    const firstSessionId = (runtime.processInbound as ReturnType<typeof vi.fn>).mock.calls[0]![0].sessionId;
    const secondSessionId = (runtime.processInbound as ReturnType<typeof vi.fn>).mock.calls[1]![0].sessionId;

    // Touch the first session so the second session becomes the LRU entry.
    await gateway.handleAction('slack', firstSessionId, 'approve');
    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U3',
      externalChannelId: 'C3',
      externalMessageId: 'M3',
      text: 'three',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    (slackAdapter.send as ReturnType<typeof vi.fn>).mockClear();

    await gateway.handleAction('slack', firstSessionId, 'approve');
    expect(slackAdapter.send).toHaveBeenLastCalledWith(
      firstSessionId,
      expect.objectContaining({ metadata: expect.objectContaining({ channelId: 'C1' }) }),
    );

    await gateway.handleAction('slack', secondSessionId, 'approve');
    expect(slackAdapter.send).toHaveBeenLastCalledWith(
      secondSessionId,
      expect.not.objectContaining({ metadata: expect.anything() }),
    );
  });

  it('close() clears remembered route metadata', async () => {
    const slackAdapter = mockAdapter('slack');
    gateway.registerAdapter(slackAdapter);

    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'ping',
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });
    const sessionId = (runtime.processInbound as ReturnType<typeof vi.fn>).mock.calls[0]![0].sessionId;
    (slackAdapter.send as ReturnType<typeof vi.fn>).mockClear();

    gateway.close();
    await gateway.handleAction('slack', sessionId, 'approve');

    expect(slackAdapter.send).toHaveBeenLastCalledWith(
      sessionId,
      expect.not.objectContaining({ metadata: expect.anything() }),
    );
  });

  it('rejects invalid route metadata cache limits', () => {
    expect(() => new ChatGateway(runtime, { routeMetadataMaxEntries: 0 })).toThrow(
      'routeMetadataMaxEntries must be a positive safe integer',
    );
  });
});
