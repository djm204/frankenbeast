# External Communication Channels — Implementation Plan

**Date:** 2026-03-08
**Status:** Proposed
**Scope:** Cross-module

## Goal

Add optional communication channels for interacting with Frankenbeast through:

- Slack
- Discord
- Telegram
- WhatsApp

These channels are not independent agent stacks. They are transport adapters over the shared chat interface and `ConversationEngine`.

**Hard dependency:** the chat interface must exist first. This work starts only after the shared chat core, session model, and HTTP/backend chat interface are in place.

---

## Product Definition

The user should be able to talk to Frankenbeast from supported messaging platforms and get the same behavior as the native CLI/web chat:

- ask normal questions
- request plans
- trigger coding or execution flows
- receive progress updates
- respond to approvals

The system should preserve one canonical conversation model underneath, regardless of channel.

---

## Non-Goals

- Building custom logic per platform beyond formatting and interaction handling
- Supporting every feature each platform offers in v1
- Multi-party collaboration semantics in shared rooms beyond basic thread/channel mapping
- Full parity with rich native web UI features on day one

---

## Guiding Principle

**Channel adapters should only translate transport semantics.**

They should not decide:

- model tier
- routing
- planning
- execution
- approval rules

Those remain in the chat engine and governor.

---

## Existing Reusable Seams

The repo already has patterns worth reusing:

- `franken-governor` channel strategy pattern for Slack and CLI
- Hono-based HTTP boundaries for webhooks and APIs
- signature verification and signed approval patterns
- orchestrator session model and shared chat plan now being introduced

This plan extends that style from HITL approvals into full message transport.

---

## Recommended Package Shape

Create a new package: `franken-comms`

```text
franken-comms/
├── src/
│   ├── core/
│   │   ├── channel-message.ts
│   │   ├── channel-session.ts
│   │   ├── channel-registry.ts
│   │   ├── comms-config.ts
│   │   └── errors.ts
│   ├── gateway/
│   │   ├── inbound-router.ts
│   │   ├── outbound-dispatcher.ts
│   │   ├── chat-gateway.ts
│   │   └── session-mapper.ts
│   ├── channels/
│   │   ├── slack/
│   │   ├── discord/
│   │   ├── telegram/
│   │   └── whatsapp/
│   ├── security/
│   │   ├── replay-protection.ts
│   │   ├── webhook-signature.ts
│   │   └── secret-rotation.ts
│   ├── server/
│   │   ├── app.ts
│   │   ├── routes.ts
│   │   └── middleware.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
```

This keeps third-party platform complexity out of `franken-orchestrator`.

---

## Core Architecture

## 1. Canonical inbound message

Every platform-specific inbound event should normalize into:

```ts
interface ChannelInboundMessage {
  channelType: 'slack' | 'discord' | 'telegram' | 'whatsapp';
  externalUserId: string;
  externalChannelId: string;
  externalThreadId?: string;
  externalMessageId: string;
  text: string;
  rawEvent: unknown;
  receivedAt: string;
}
```

## 2. Channel session mapping

Each platform conversation maps to one Frankenbeast chat session using a deterministic key such as:

- Slack: workspace + channel + thread
- Discord: guild + channel + thread or DM
- Telegram: chat id
- WhatsApp: sender number + conversation window

The mapper must support:

- create on first message
- resume existing session
- per-channel transcript continuity

## 3. Shared chat backend (WebSocket Bridge)

After normalization, every inbound message goes through the same flow:

`ChannelInboundMessage -> SessionMapper -> WebSocketBridge -> Orchestrator (WebSocket) -> ChannelOutboundMessage`

The gateway maintains (or re-establishes) a WebSocket connection to the `franken-orchestrator`'s `/v1/chat/ws` endpoint for each active session. This allows the gateway to:
- Stream incremental execution progress (deltas) back to the channel (e.g., Slack thread updates)
- Receive real-time approval requests
- Handle multi-turn turns without repeated HTTP overhead

## 4. Canonical outbound message

The chat engine returns structured content that adapters can render:

```ts
interface ChannelOutboundMessage {
  text: string;
  status?: 'reply' | 'clarify' | 'plan' | 'execute' | 'progress' | 'approval';
  actions?: Array<{
    id: string;
    label: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  metadata?: Record<string, unknown>;
  delta?: string; // For streaming updates
}
```

Platform adapters then convert this into Slack blocks, Discord embeds, Telegram messages, or WhatsApp-compatible text/buttons.

---

## WebSocket Bridge Adapter

The `franken-comms` package includes a `ChatSocketBridge` that implements the client-side of the orchestrator's WebSocket protocol (`ws-chat-types.ts`).

Responsibilities:
- **Authentication**: Exchanges a session token with the orchestrator
- **Streaming**: Subscribes to `assistant.message.delta` and `turn.execution.progress` events
- **State Management**: Tracks session state and pending approvals
- **Heartbeat**: Maintains connection health

---

## Phase 1 — Core Comms Abstractions

Deliverables:

- `ChannelAdapter` interface
- canonical inbound/outbound message types
- session mapper
- `ChatSocketBridge` (WebSocket client for orchestrator)
- channel registry
- config schema

Tests:

- mapping inbound messages to sessions
- `ChatSocketBridge` protocol compliance
- outbound renderer contract tests
- idempotency and dedupe behavior

## Phase 2 — Shared Gateway and Server

Use Hono for inbound webhooks.

Deliverables:

- webhook server scaffold
- per-channel route registration
- auth, signature, and replay middleware
- bridge into `ChatSocketBridge`

Tests:

- invalid payload rejected with `422`
- invalid signature rejected
- duplicate event ignored
- valid event triggers WebSocket message relay


## Phase 3 — Slack Integration

Deliverables:

- Slack adapter
- slash/app mention entry
- thread session mapping
- Block Kit renderer
- interactive button callback flow

Tests:

- mention creates turn
- thread resumes session
- approval buttons map to canonical approval response
- execution progress posts into the same thread

## Phase 4 — Discord Integration

Deliverables:

- Discord adapter
- slash command support
- mention gating
- embed/button renderer

Tests:

- slash command starts session
- mention triggers only when configured
- button interaction is routed correctly

## Phase 5 — Telegram Integration

Deliverables:

- Telegram bot adapter
- webhook route
- inline keyboard support
- chat id session mapping

Tests:

- direct message starts session
- callback query maps to approval/action
- duplicate updates are ignored

## Phase 6 — WhatsApp Integration

Deliverables:

- WhatsApp adapter
- provider bridge abstraction
- session-window-aware outbound policy
- conservative text renderer

Tests:

- inbound text maps to session
- replies outside allowed window are blocked or templated correctly
- approval and concise execution summaries render safely

## Phase 7 — Multi-Channel Hardening

Deliverables:

- channel health reporting
- backoff and retry policies
- flood/spam controls
- operator allowlists
- dashboard metrics integration

Tests:

- per-channel rate limits
- disabled channel rejects traffic
- misconfigured secrets fail startup

---

## Suggested Build Order

1. Finish shared chat interface
2. Build `franken-comms` core abstractions
3. Add webhook server and shared gateway
4. Ship Slack first
5. Ship Discord second
6. Ship Telegram third
7. Ship WhatsApp last

This order matches both implementation complexity and expected utility.

---

## Why This Order

- **Slack first** because the repo already has Slack channel precedent and approval flows
- **Discord second** because interaction primitives are strong and developer usage is natural
- **Telegram third** because it is simple and useful for personal operations
- **WhatsApp last** because policy and provider constraints are higher

---

## First Milestone

The first meaningful milestone is:

**"A Slack DM or thread can talk to Frankenbeast, stay attached to a real Beast chat session, escalate coding requests through the shared chat engine, and round-trip approvals."**

Until that works, the other channels are follow-on adapters.

---

## Exit Criteria

This work is complete when:

- all four channels are optional and independently configurable
- each channel maps cleanly into the same chat engine
- approvals and execution progress work consistently
- signatures, dedupe, and rate limits are enforced
- channel usage feeds the dashboard and analytics stack
- no channel contains business logic that belongs in the chat core

