import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChannelAdapter } from '../../../src/comms/core/types.js';
import type {
  CommsRuntimePort,
  CommsInboundResult,
} from '../../../src/comms/core/comms-runtime-port.js';
import { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';

function mockAdapter(type: 'slack' | 'discord' | 'telegram' | 'whatsapp'): ChannelAdapter {
  return {
    type,
    capabilities: {
      threads: true,
      buttons: true,
      slashCommands: true,
      richBlocks: true,
      fileUpload: true,
      markdownFlavor: type === 'slack' ? 'slack' : 'plain',
    },
    send: vi.fn().mockResolvedValue(undefined),
  };
}

describe('comms round-trip integration', () => {
  let mockRuntime: CommsRuntimePort;
  let mockSlackAdapter: ChannelAdapter;
  let mockDiscordAdapter: ChannelAdapter;
  let gateway: ChatGateway;

  beforeEach(() => {
    mockRuntime = {
      processInbound: vi.fn().mockResolvedValue({
        text: 'Task complete.',
        status: 'reply',
        provider: { name: 'claude-cli', model: 'claude-sonnet-4-6' },
        phase: 'execution',
      } satisfies CommsInboundResult),
    };

    mockSlackAdapter = mockAdapter('slack');
    mockDiscordAdapter = mockAdapter('discord');

    gateway = new ChatGateway(mockRuntime);
    gateway.registerAdapter(mockSlackAdapter);
    gateway.registerAdapter(mockDiscordAdapter);
  });

  const slackMessage = {
    channelType: 'slack' as const,
    externalUserId: 'U123',
    externalChannelId: 'C456',
    externalThreadId: 'T789',
    externalMessageId: 'M001',
    text: 'deploy to staging',
    rawEvent: {},
    receivedAt: new Date().toISOString(),
  };

  it('routes Slack inbound → runtime → Slack outbound with provider metadata', async () => {
    await gateway.handleInbound(slackMessage);

    // Runtime received the message
    expect(mockRuntime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: 'slack',
        text: 'deploy to staging',
      }),
    );

    // Reply routed to Slack adapter (not Discord)
    expect(mockSlackAdapter.send).toHaveBeenCalled();
    expect(mockDiscordAdapter.send).not.toHaveBeenCalled();

    // Outbound includes provider metadata
    const outbound = (mockSlackAdapter.send as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(outbound.provider).toEqual({
      name: 'claude-cli',
      model: 'claude-sonnet-4-6',
    });
  });

  it('routes Discord inbound → runtime → Discord outbound', async () => {
    await gateway.handleInbound({
      ...slackMessage,
      channelType: 'discord',
      externalUserId: 'D123',
    });

    expect(mockDiscordAdapter.send).toHaveBeenCalled();
    expect(mockSlackAdapter.send).not.toHaveBeenCalled();
  });

  it('handles provider failover metadata in outbound', async () => {
    (mockRuntime.processInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Resumed after rate limit.',
      status: 'reply',
      provider: {
        name: 'codex-cli',
        switchedFrom: 'claude-cli',
        switchReason: 'rate-limit',
      },
      phase: 'execution',
    } satisfies CommsInboundResult);

    await gateway.handleInbound(slackMessage);

    const outbound = (mockSlackAdapter.send as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(outbound.provider.switchedFrom).toBe('claude-cli');
    expect(outbound.provider.switchReason).toBe('rate-limit');
  });

  it('works without provider metadata (backwards compatible)', async () => {
    (mockRuntime.processInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: 'Simple reply.',
      status: 'reply',
    } satisfies CommsInboundResult);

    await gateway.handleInbound(slackMessage);

    const outbound = (mockSlackAdapter.send as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(outbound.provider).toBeUndefined();
  });

  it('same thread → same session across multiple messages', async () => {
    await gateway.handleInbound({ ...slackMessage, text: 'first' });
    await gateway.handleInbound({ ...slackMessage, text: 'second' });

    const calls = (mockRuntime.processInbound as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].sessionId).toBe(calls[1]![0].sessionId);
  });

  it('different threads → different sessions', async () => {
    await gateway.handleInbound({ ...slackMessage, externalThreadId: 'T1' });
    await gateway.handleInbound({ ...slackMessage, externalThreadId: 'T2' });

    const calls = (mockRuntime.processInbound as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].sessionId).not.toBe(calls[1]![0].sessionId);
  });
});
