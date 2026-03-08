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

## 3. Shared chat backend

After normalization, every inbound message goes through the same flow:

`ChannelInboundMessage -> SessionMapper -> ConversationEngine -> ChannelOutboundMessage`

## 4. Canonical outbound message

The chat engine should return structured content that adapters can render:

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
}
```

Platform adapters then convert this into Slack blocks, Discord embeds, Telegram messages, or WhatsApp-compatible text/buttons.

---

## Capability Model

Each channel has different affordances. Model them explicitly:

```ts
interface ChannelCapabilities {
  threads: boolean;
  buttons: boolean;
  slashCommands: boolean;
  richBlocks: boolean;
  fileUpload: boolean;
  markdownFlavor: 'slack' | 'discord' | 'telegram' | 'plain';
}
```

Do not assume feature parity.

---

## Channel-by-Channel Plan

## Slack

Best v1 uses:

- DMs
- channel threads
- approval actions with interactive buttons

Inbound:

- Events API webhook
- slash command or app mention
- interactive action callbacks

Outbound:

- Block Kit
- thread replies
- buttons for approval and next-step actions

Notes:

- Reuse existing Slack approval patterns from `franken-governor`
- support thread affinity so one thread maps to one Beast session

## Discord

Best v1 uses:

- DMs
- bot mentions in channels
- thread replies

Inbound:

- interactions endpoint for slash commands
- message create events
- button interactions

Outbound:

- embeds
- buttons
- follow-up messages for execution progress

Notes:

- support explicit `/franken` slash command for clean invocation
- ignore non-mentioned channel chatter by default

## Telegram

Best v1 uses:

- direct chat with bot
- optional group mention mode later

Inbound:

- webhook updates
- text messages
- callback queries from inline keyboards

Outbound:

- text messages
- inline keyboard buttons

Notes:

- keep formatting conservative
- ideal as a lightweight personal control surface

## WhatsApp

Best v1 uses:

- direct operator communication
- alerts, approvals, and concise task exchange

Inbound:

- webhook via Meta WhatsApp Business API or Twilio bridge
- text replies
- button replies where supported

Outbound:

- concise text
- template messages for re-engagement if outside the allowed session window

Notes:

- this is the most constrained channel
- make it the last implementation target
- assume stricter message length and re-contact rules

---

## Security Requirements

Per the repo rules and existing governor patterns, every channel integration must include:

- signature verification on inbound webhooks where the platform supports it
- replay protection on webhook events
- schema validation on all payloads
- secret validation at startup
- rate limiting
- idempotency for duplicate event delivery
- no raw provider payload logging in full
- explicit redaction of tokens, secrets, phone numbers, and personal identifiers

Each inbound event should be stored with:

- normalized id
- dedupe key
- verification status
- source channel

Fail closed on invalid signatures.

---

## Approval Flow

Messaging channels should support governor approvals, but through the same approval model as the web and CLI chat.

Recommended approach:

- the chat engine emits an `approval` outbound message
- the channel adapter renders channel-native actions
- user response maps back to the canonical approval endpoint or shared approval service

Do not create separate approval semantics per platform.

---

## Progress and Streaming

Messaging platforms are not full-duplex UIs, so execution feedback should be incremental but compact.

Use a standard pattern:

1. acknowledgment message
2. optional plan summary
3. execution started
4. periodic progress updates
5. final result summary
6. approval prompt when needed

Progress updates must be rate-limited to avoid channel spam.

---

## Configuration Model

Add channel config under a top-level communication package config:

```ts
interface CommsConfig {
  enabledChannels: Array<'slack' | 'discord' | 'telegram' | 'whatsapp'>;
  defaultProjectId?: string;
  sessionMappingStrategy: 'thread' | 'channel' | 'dm';
  slack?: SlackConfig;
  discord?: DiscordConfig;
  telegram?: TelegramConfig;
  whatsapp?: WhatsAppConfig;
}
```

Each channel config should include:

- secrets/tokens
- webhook endpoint configuration
- allowed workspaces/servers/chats
- permitted usage mode: DM only, mentions only, thread only

---

## Metrics and Analytics

These channel integrations should feed the dashboard plan.

Track:

- inbound messages by channel
- sessions by channel
- execution turns by channel
- approvals by channel
- failures by channel
- response latency by channel
- cheap vs premium usage by channel
- cost per channel

This is critical for knowing which communication surfaces are actually worth operating.

---

## Phased Delivery

## Phase 0 — Prerequisites

Must already exist:

- shared `ConversationEngine`
- persistent chat sessions
- HTTP/API chat entrypoint
- approval endpoint or shared approval service
- dashboard telemetry event hooks

Without those, stop. Do not start channel work first.

## Phase 1 — Core Comms Abstractions

Deliverables:

- `ChannelAdapter` interface
- canonical inbound/outbound message types
- session mapper
- channel registry
- config schema

Tests:

- mapping inbound messages to sessions
- outbound renderer contract tests
- idempotency and dedupe behavior

## Phase 2 — Shared Gateway and Server

Use Hono.

Deliverables:

- webhook server scaffold
- per-channel route registration
- auth, signature, and replay middleware
- bridge into `ConversationEngine`

Tests:

- invalid payload rejected with `422`
- invalid signature rejected
- duplicate event ignored
- valid event creates or resumes session

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

