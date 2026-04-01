import { describe, it, expect, vi } from 'vitest';
import { ChatGateway } from '../../../src/comms/gateway/chat-gateway.js';
import type { CommsRuntimePort } from '../../../src/comms/core/comms-runtime-port.js';
import type { ChannelAdapter } from '../../../src/comms/core/types.js';

describe('HITL approval via comms gateway', () => {
  function createMockRuntime(): CommsRuntimePort {
    return {
      processInbound: vi.fn().mockResolvedValue({ text: 'Approved.' }),
    };
  }

  function createMockSlackAdapter(): ChannelAdapter {
    return {
      type: 'slack',
      send: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('routes approve action as /approve through runtime', async () => {
    const runtime = createMockRuntime();
    const gateway = new ChatGateway(runtime);
    const slackAdapter = createMockSlackAdapter();
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'session-1', 'approve');

    expect(runtime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        channelType: 'slack',
        text: '/approve',
        externalUserId: 'system',
      }),
    );
  });

  it('routes reject action as plain text rejection', async () => {
    const runtime = createMockRuntime();
    const gateway = new ChatGateway(runtime);
    const slackAdapter = createMockSlackAdapter();
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'session-1', 'reject');

    expect(runtime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Action rejected by user: reject',
      }),
    );
  });

  it('relays runtime response back to slack adapter', async () => {
    const runtime = createMockRuntime();
    const gateway = new ChatGateway(runtime);
    const slackAdapter = createMockSlackAdapter();
    gateway.registerAdapter(slackAdapter);

    await gateway.handleAction('slack', 'session-1', 'approve');

    expect(slackAdapter.send).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ text: 'Approved.' }),
    );
  });

  it('full inbound → approve round-trip', async () => {
    const runtime: CommsRuntimePort = {
      processInbound: vi.fn()
        .mockResolvedValueOnce({ text: 'Pending approval. Use /approve to continue.' })
        .mockResolvedValueOnce({ text: 'Action approved and executed.' }),
    };
    const gateway = new ChatGateway(runtime);
    const slackAdapter = createMockSlackAdapter();
    gateway.registerAdapter(slackAdapter);

    // Step 1: User sends a message that triggers HITL
    await gateway.handleInbound({
      channelType: 'slack',
      externalUserId: 'U123',
      externalChannelId: 'C456',
      text: 'deploy to production',
    });

    expect(slackAdapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: 'Pending approval. Use /approve to continue.' }),
    );

    // Step 2: User clicks approve button
    const sessionId = (slackAdapter.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    await gateway.handleAction('slack', sessionId, 'approve');

    expect(runtime.processInbound).toHaveBeenCalledTimes(2);
    expect(slackAdapter.send).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ text: 'Action approved and executed.' }),
    );
  });
});
