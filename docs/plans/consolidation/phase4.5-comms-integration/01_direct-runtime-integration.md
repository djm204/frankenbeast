# Chunk 4.5.01: Replace ChatSocketBridge with Direct ChatRuntime Integration

**Phase:** 4.5 — Comms Integration
**Depends on:** Phase 1 (comms absorbed into orchestrator)
**Estimated size:** Medium

---

## Context

After Phase 1, comms source code lives in `packages/franken-orchestrator/src/comms/` but still uses `ChatSocketBridge` to connect to the chat server via `ws://localhost:3737/v1/chat/ws`. Since both comms and chat now live in the same process, this WebSocket hop is unnecessary and introduces an unencrypted local network surface.

This chunk replaces the WebSocket bridge with direct in-process calls from `ChatGateway` to `ChatRuntime`.

## What to Do

### 1. Define a comms-facing runtime interface

Create a slim interface that ChatGateway depends on, decoupled from the full ChatRuntime class:

```typescript
// packages/franken-orchestrator/src/comms/core/comms-runtime-port.ts

export interface CommsRuntimePort {
  /**
   * Process an inbound message from an external channel.
   * Returns the assistant's response for relay back to the channel.
   */
  processInbound(input: CommsInboundInput): Promise<CommsInboundResult>;
}

export interface CommsInboundInput {
  sessionId: string;
  channelType: ChannelType;
  text: string;
  externalUserId: string;
  metadata?: Record<string, unknown>;
}

export interface CommsInboundResult {
  text: string;
  status?: OutboundMessageStatus;
  actions?: ChannelAction[];
  metadata?: Record<string, unknown>;
}
```

### 2. Implement the adapter

Wrap `ChatRuntime` behind the `CommsRuntimePort` interface:

```typescript
// packages/franken-orchestrator/src/comms/core/chat-runtime-comms-adapter.ts

import type { CommsRuntimePort, CommsInboundInput, CommsInboundResult } from './comms-runtime-port.js';
import type { ChatRuntime } from '../../chat/runtime.js';
import type { ISessionStore } from '../../chat/session-store.js';

export class ChatRuntimeCommsAdapter implements CommsRuntimePort {
  constructor(
    private readonly runtime: ChatRuntime,
    private readonly sessionStore: ISessionStore,
  ) {}

  async processInbound(input: CommsInboundInput): Promise<CommsInboundResult> {
    // Load or create session
    const session = await this.sessionStore.load(input.sessionId)
      ?? await this.sessionStore.create(input.sessionId, { channelType: input.channelType });

    // Run through ChatRuntime
    const result = await this.runtime.run(input.text, {
      sessionId: input.sessionId,
      pendingApproval: session.state === 'pending_approval',
      projectId: session.projectId,
      transcript: session.transcript,
      beastContext: session.beastContext ?? null,
    });

    // Persist updated session
    await this.sessionStore.save(input.sessionId, {
      ...session,
      transcript: result.transcript,
      state: result.state,
    });

    // Map to comms outbound format
    const display = result.displayMessages[0];
    return {
      text: display?.content ?? '',
      status: display?.kind as OutboundMessageStatus | undefined,
      actions: undefined, // TODO: map approval actions
      metadata: input.metadata,
    };
  }
}
```

### 3. Rewire ChatGateway

Update `ChatGateway` constructor to accept `CommsRuntimePort` instead of a WebSocket URL:

```typescript
// packages/franken-orchestrator/src/comms/gateway/chat-gateway.ts

export class ChatGateway {
  constructor(
    private readonly runtime: CommsRuntimePort,
    private readonly adapters: Map<ChannelType, ChannelAdapter>,
  ) {}

  async handleInbound(message: ChannelInboundMessage): Promise<void> {
    const sessionId = SessionMapper.mapToSessionId(message);

    const result = await this.runtime.processInbound({
      sessionId,
      channelType: message.channelType,
      text: message.text,
      externalUserId: message.externalUserId,
      metadata: {
        externalChannelId: message.externalChannelId,
        externalThreadId: message.externalThreadId,
      },
    });

    await this.relayToChannel(message.channelType, sessionId, result);
  }

  // relayToChannel picks the adapter by channelType and calls send()
}
```

### 4. Remove ChatSocketBridge

- Delete `src/comms/core/chat-socket-bridge.ts`
- Remove `ws` from orchestrator dependencies (if no other consumer)
- Remove `@types/ws` from devDependencies (if no other consumer)
- Delete or update `tests/unit/comms/chat-socket-bridge.test.ts`

### 5. Remove ws-chat-auth dependency from comms

The comms subsystem no longer needs WebSocket auth tokens. Remove any imports of `ws-chat-auth.ts` from comms code. The auth module itself stays — it's still used by external WebSocket clients (dashboard, CLI remote attach).

### 6. Update gateway construction in dep-factory/server bootstrap

Wherever `ChatGateway` is constructed (likely in `comms-gateway-service.ts` or the server bootstrap), inject the `ChatRuntimeCommsAdapter` instead of a WebSocket URL:

```typescript
const commsAdapter = new ChatRuntimeCommsAdapter(chatRuntime, sessionStore);
const gateway = new ChatGateway(commsAdapter, channelAdapters);
```

## Files

- **Create:** `src/comms/core/comms-runtime-port.ts` (interface)
- **Create:** `src/comms/core/chat-runtime-comms-adapter.ts` (adapter)
- **Modify:** `src/comms/gateway/chat-gateway.ts` (inject port instead of WS URL)
- **Delete:** `src/comms/core/chat-socket-bridge.ts`
- **Modify:** `src/comms/index.ts` or barrel exports (remove bridge exports)
- **Modify:** `src/network/services/comms-gateway-service.ts` (new construction)
- **Modify:** `package.json` (remove `ws` if unused elsewhere)
- **Delete/Rewrite:** `tests/unit/comms/chat-socket-bridge.test.ts`
- **Create:** `tests/unit/comms/chat-runtime-comms-adapter.test.ts`
- **Modify:** `tests/unit/comms/chat-gateway.test.ts` (inject mock port instead of mock WS)

## Tests

### chat-runtime-comms-adapter.test.ts
- `processInbound()` calls `runtime.run()` with correct session state
- Creates session if not found in store
- Persists updated transcript after runtime call
- Maps display message to comms outbound format

### chat-gateway.test.ts (updated)
- `handleInbound()` calls `runtime.processInbound()` with mapped session ID
- `handleInbound()` relays result to correct channel adapter
- Works with all four channel types

## Exit Criteria

- `ChatSocketBridge` does not exist in the codebase
- `ws` is not in orchestrator's dependencies (unless used elsewhere)
- ChatGateway calls `CommsRuntimePort.processInbound()` — no network call
- All existing comms tests pass (with updated mocks)
- New adapter tests pass
- `npm run build && npm run typecheck && npm test` succeeds
