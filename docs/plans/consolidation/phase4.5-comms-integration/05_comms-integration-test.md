# Chunk 4.5.05: Integration Test — Platform Message → ChatRuntime → Channel Reply

**Phase:** 4.5 — Comms Integration
**Depends on:** Chunks 01–04
**Estimated size:** Small

---

## Context

Chunks 01–04 build the comms integration pieces independently. This chunk proves they work together end-to-end: an inbound platform message reaches ChatRuntime through the direct in-process path, and the reply flows back to the correct channel adapter with provider metadata and correct formatting.

## What to Do

### 1. Write the round-trip integration test

```typescript
// packages/franken-orchestrator/tests/integration/comms/comms-round-trip.test.ts

describe('comms round-trip integration', () => {
  // Shared setup
  let gateway: ChatGateway;
  let mockRuntime: CommsRuntimePort;
  let mockSlackAdapter: ChannelAdapter;
  let mockDiscordAdapter: ChannelAdapter;

  beforeEach(() => {
    mockRuntime = {
      processInbound: vi.fn().mockResolvedValue({
        text: 'Task complete.',
        status: 'reply',
        provider: { name: 'claude-cli', model: 'claude-sonnet-4-6' },
        phase: 'execution',
      }),
    };

    mockSlackAdapter = { type: 'slack', capabilities: slackCaps, send: vi.fn() };
    mockDiscordAdapter = { type: 'discord', capabilities: discordCaps, send: vi.fn() };

    gateway = new ChatGateway(mockRuntime, new Map([
      ['slack', mockSlackAdapter],
      ['discord', mockDiscordAdapter],
    ]));
  });

  it('routes Slack inbound → runtime → Slack outbound with provider metadata', async () => {
    const inbound: ChannelInboundMessage = {
      channelType: 'slack',
      externalUserId: 'U123',
      externalChannelId: 'C456',
      externalThreadId: 'T789',
      externalMessageId: 'M001',
      text: 'deploy to staging',
      rawEvent: {},
      receivedAt: new Date().toISOString(),
    };

    await gateway.handleInbound(inbound);

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
    const outbound = (mockSlackAdapter.send as Mock).mock.calls[0][1];
    expect(outbound.provider).toEqual({
      name: 'claude-cli',
      model: 'claude-sonnet-4-6',
    });
  });

  it('routes Discord inbound → runtime → Discord outbound', async () => {
    // ... same pattern, channelType: 'discord'
  });

  it('handles provider failover metadata in outbound', async () => {
    (mockRuntime.processInbound as Mock).mockResolvedValueOnce({
      text: 'Resumed after rate limit.',
      status: 'reply',
      provider: {
        name: 'codex-cli',
        switchedFrom: 'claude-cli',
        switchReason: 'rate-limit',
      },
      phase: 'execution',
    });

    await gateway.handleInbound(slackMessage);

    const outbound = (mockSlackAdapter.send as Mock).mock.calls[0][1];
    expect(outbound.provider.switchedFrom).toBe('claude-cli');
    expect(outbound.provider.switchReason).toBe('rate-limit');
  });

  it('works without provider metadata (backwards compatible)', async () => {
    (mockRuntime.processInbound as Mock).mockResolvedValueOnce({
      text: 'Simple reply.',
      status: 'reply',
    });

    await gateway.handleInbound(slackMessage);

    const outbound = (mockSlackAdapter.send as Mock).mock.calls[0][1];
    expect(outbound.provider).toBeUndefined();
  });
});
```

### 2. Webhook → gateway integration test

Test the full HTTP path: a mocked Slack webhook request hits the Hono router, which calls the gateway, which calls the runtime:

```typescript
describe('webhook → gateway → runtime', () => {
  it('Slack event webhook triggers full round-trip', async () => {
    const app = createCommsApp({
      gateway,
      commsConfig: testConfig,
      securityProfile: 'permissive', // skip signature for test
    });

    const res = await app.request('/webhooks/slack/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: '<@BOT> check status',
          user: 'U123',
          channel: 'C456',
          ts: '1234567890.123456',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockRuntime.processInbound).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'check status' }),
    );
  });
});
```

### 3. Session determinism test

Verify that the same Slack thread always produces the same session ID, and different threads produce different IDs:

```typescript
it('same thread → same session across multiple messages', async () => {
  await gateway.handleInbound({ ...slackMessage, text: 'first' });
  await gateway.handleInbound({ ...slackMessage, text: 'second' });

  const calls = (mockRuntime.processInbound as Mock).mock.calls;
  expect(calls[0][0].sessionId).toBe(calls[1][0].sessionId);
});

it('different threads → different sessions', async () => {
  await gateway.handleInbound({ ...slackMessage, externalThreadId: 'T1' });
  await gateway.handleInbound({ ...slackMessage, externalThreadId: 'T2' });

  const calls = (mockRuntime.processInbound as Mock).mock.calls;
  expect(calls[0][0].sessionId).not.toBe(calls[1][0].sessionId);
});
```

## Files

- **Create:** `tests/integration/comms/comms-round-trip.test.ts`

## Exit Criteria

- Inbound message from each channel type reaches `CommsRuntimePort.processInbound()`
- Reply routes to the correct channel adapter (not all adapters)
- Provider metadata present in outbound when runtime provides it
- Provider metadata absent when runtime doesn't provide it (no crash)
- Failover metadata (switchedFrom, switchReason) propagated correctly
- Session ID deterministic per thread/channel
- HTTP webhook → gateway path works end-to-end
- `npm test` passes
