# ADR 016: External Communications Gateway

## Status
Accepted

## Context
Frankenbeast requires the ability to interact with users through external messaging platforms (Slack, Discord, Telegram, WhatsApp) while maintaining a single canonical conversation model. These platforms primarily use asynchronous HTTP webhooks for inbound events, whereas the Frankenbeast orchestrator provides a real-time, streaming WebSocket interface for the web dashboard.

## Decision
We will implement a dedicated `franken-comms` package that acts as a secure "Gateway" between external platforms and the orchestrator.

### 1. Unified Transport Bridge
The gateway will normalize platform-specific webhooks (e.g., Slack Events API) into internal `ChannelInboundMessage` types and relay them to the orchestrator via the `/v1/chat/ws` WebSocket endpoint. This allows external channels to benefit from the same streaming execution progress and real-time approval requests as the native web UI.

### 2. Deterministic Session Mapping
Instead of a stateful lookup table, we use a deterministic mapping strategy:
`sessionId = sha256(channelType + externalChannelId + (externalThreadId || externalUserId))`.
This ensures conversation continuity (e.g., staying within a Slack thread) across gateway restarts without requiring a persistent mapping database.

### 3. Edge Security (First-Class Citizen)
Each channel integration MUST implement platform-native request verification at the entry point:
- **Slack**: HMAC-SHA256 signature verification with a 5-minute replay protection window.
- **Generic**: Timing-safe equality checks for all signature comparisons.
- **Validation**: Strict Zod schema enforcement for all inbound payloads before they reach the gateway logic.

## Consequences
- **Positive**: Low-latency, streaming feedback on Slack/Discord; shared business logic in `ConversationEngine`; horizontal scalability of the gateway.
- **Negative**: Increased architectural complexity (Gateway -> Orchestrator bridge); requires the orchestrator to be reachable by the gateway (via internal or external networking).
- **Security**: Reduces the attack surface by centralizing webhook verification and PII sanitization (via `franken-brain` downstream) before execution occurs.
