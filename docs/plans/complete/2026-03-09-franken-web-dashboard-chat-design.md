# Frankenbeast Dashboard Chat Design

**Date:** 2026-03-09
**Status:** Approved
**Scope:** `packages/franken-web`, `packages/franken-orchestrator`

## Goal

Turn `franken-web` into the first real Frankenbeast dashboard surface:

- a routed dashboard shell with Frankenbeast branding and visible product version
- a production-grade chat workspace housed inside that dashboard
- real-time chat transport with streamed assistant output, typing indicators, and receipts
- secure runtime wiring to the same shared chat engine used by `frankenbeast chat`

The web UI should stop looking like a thin demo shell and instead behave like an operator-facing CMS/admin product.

## Product Shape

`franken-web` becomes a dashboard app, not a single bare chat page.

### Information architecture

- `Chat` is the only live module
- `Sessions`, `Analytics`, `Costs`, `Safety`, and `Settings` are present in navigation but disabled or marked as upcoming
- the app uses a real routed shell so future modules can be added without restructuring the UI

### Branding

- sidebar branding shows `Frankenbeast`
- the displayed version comes from the root repo package version, not `@frankenbeast/web`
- the current root product version is `0.9.0` from `package.json`

### Layout

- left sidebar for brand, version, navigation, and environment status
- top bar for project/session context, transport state, model tier, and spend summary
- central workspace canvas with the chat page as the active module
- right-side operations rail on the chat page for approvals, activity, and cost state

## UX Direction

The chat surface should feel like a serious operator console:

- denser spacing and stronger hierarchy than a consumer messenger
- panel-based dashboard composition
- clear state surfaces for connection, routing, execution, and approvals
- optimistic message sending with visible lifecycle state
- assistant typing placeholder before the first streamed content arrives

### Frankenbeast visual language

The styling should pull directly from the existing Frankenbeast assets and CLI banner rather than inventing a neutral admin theme.

Reference assets:

- `assets/img/frankenbeast-github-logo.png`
- `assets/img/frankenbeast-github-logo-478x72.png`
- `assets/img/frankenbeast-logo-ascii.png`
- the green ANSI banner in `packages/franken-orchestrator/src/logging/beast-logger.ts`

Brand cues to preserve:

- electric green / acid glow as the primary accent
- black and near-black backgrounds as the structural base
- oxidized metal, brass, and dirty industrial tones as secondary surfaces
- bright green highlight states for active system status
- restrained lightning/energy motifs for emphasis, not decoration overload

The result should feel like Frankenbeast control software, not a generic SaaS dashboard.

### Responsive behavior

The dashboard must work on both desktop and mobile.

- desktop: full sidebar, topbar, wide transcript, separate right rail
- tablet: compressed sidebar and narrower operations rail
- mobile: sidebar collapses into a drawer, topbar compacts, transcript and operations rail stack vertically, composer stays pinned and usable at the bottom
- no horizontal overflow in transcript rows, metrics cards, or approval panels
- connection state, pending approval state, and send controls must remain visible without requiring desktop-only affordances

### Chat page behavior

- transcript is the primary surface
- composer is docked and persistent
- user messages can show `sending`, `delivered`, and `read`
- assistant responses stream incrementally instead of appearing only after completion
- execution events update the activity rail in real time
- approval requests appear in a dedicated panel with authoritative server state

## Runtime Architecture

The web chat must not become a separate chat implementation.

Both CLI and web should share:

- `ConversationEngine`
- `TurnRunner`
- chat session state
- approval semantics
- execution progress semantics

The web-specific addition is a persistent real-time transport layer.

### REPL parity requirement

The dashboard chat is a transport and presentation wrapper around the REPL chat runtime, not a sibling implementation.

- web and CLI must use the same `ConversationEngine` behavior
- web and CLI must use the same `TurnRunner` behavior
- web must preserve the same turn routing, escalation, approval, and execution semantics as `frankenbeast chat`
- any CLI-specific continuation behavior that affects prompt construction or session handling must be modeled explicitly in the web transport layer rather than reimplemented differently
- if a turn behaves differently between web and CLI, that is a bug unless the difference is a deliberate transport-only affordance such as receipts or typing indicators

The intended architecture is:

- REPL: terminal IO wrapper around shared chat runtime
- Web: WebSocket UI wrapper around the same shared chat runtime

### Transport

Replace the current CRUD-plus-SSE-first interaction model with a WebSocket-first chat channel.

The socket is the live source of truth for:

- session readiness
- message submission acknowledgements
- typing state
- streamed assistant deltas
- execution progress
- approvals
- cost/status updates
- receipts

Minimal HTTP endpoints may still exist for health and bootstrap, but not as the primary chat interaction model.

## Socket Event Model

### Client-to-server events

- `session.connect`
- `session.resume`
- `message.send`
- `message.read`
- `approval.respond`
- `ping`

### Server-to-client events

- `session.ready`
- `session.state`
- `message.accepted`
- `message.delivered`
- `message.read`
- `assistant.typing.start`
- `assistant.message.delta`
- `assistant.message.complete`
- `turn.routed`
- `turn.execution.start`
- `turn.execution.progress`
- `turn.approval.requested`
- `turn.approval.resolved`
- `turn.cost.updated`
- `turn.error`

The server is authoritative for receipts, approval state, and final turn outcome.

## Security Model

Security is part of the protocol and the shared chat runtime.

### Transport security

- `wss` outside explicit local development
- same-origin by default with an explicit origin allowlist
- authenticated WebSocket handshake with a short-lived session token
- session binding so clients cannot subscribe to arbitrary session IDs
- per-connection and per-message rate limiting
- strict schema validation and size limits for every inbound event

### Prompt-injection and hijacking defenses

- every user turn passes through firewall/injection scanning before routing
- tool output, repo content, and streamed execution text are treated as untrusted data
- prompt construction preserves strict boundaries between system policy, transcript, and untrusted attachments
- model output cannot silently escalate into tool execution
- destructive actions, networked actions, and premium execution remain HITL-gated
- transcript summarization must preserve safety-relevant state

### UI safety

- render chat content as escaped text by default
- never trust client-issued receipt or approval claims without server validation
- show only structured, redacted server errors

## Component Design

### `franken-web`

- `app.tsx` becomes the dashboard router entry
- a new dashboard shell component owns the sidebar, top bar, and workspace
- a new chat page owns the transcript area, composer, and operations rail
- placeholder route pages provide disabled module destinations
- a WebSocket session hook manages connection lifecycle and socket state
- shared CSS variables should define Frankenbeast brand colors, panel tones, glow states, and responsive breakpoints
- the shell should reuse repo logo assets for brand presentation instead of text-only branding

### `franken-orchestrator`

- add a WebSocket chat gateway on top of the existing chat engine
- keep `ConversationEngine` and `TurnRunner` as shared business logic
- enrich the transport to emit real-time turn lifecycle events suitable for the web UI
- ensure approvals and execution events remain aligned with CLI semantics
- factor any REPL-only glue that is actually runtime behavior into shared chat services before wiring the web transport

## Testing Strategy

### Frontend

- dashboard shell route rendering
- Frankenbeast version branding
- Frankenbeast asset-based styling and breakpoint behavior
- chat transcript streaming and typing placeholder
- receipt state rendering
- approval panel state
- socket reconnect and session resume behavior

### Backend

- authenticated socket handshake
- origin enforcement
- message event validation
- injection/firewall rejection path
- parity coverage proving CLI and web produce equivalent turn outcomes for the same inputs
- shared engine wiring for reply, clarify, plan, and execute outcomes
- approval flow and execution progress events
- unauthorized session subscription rejection

## Non-Goals

- implementing live analytics, costs, safety, or settings pages beyond placeholder navigation
- adding rich HTML message rendering
- creating a second telemetry stack separate from existing observer/orchestrator primitives
- introducing a design system disconnected from Frankenbeast’s existing brand assets

## Open Risks

- transport migration from HTTP/SSE to WebSocket touches both test surfaces and runtime assumptions
- receipt semantics need a clean server authority model to avoid fake client states
- the current web UI is thin, so layout work and transport work must land together to avoid duplicate rewrites

## Acceptance Criteria

This design is complete when:

- `franken-web` renders as a routed dashboard shell with Frankenbeast branding and version
- the dashboard styling clearly reflects the Frankenbeast logo/banner palette and remains usable on mobile and desktop
- `Chat` is the only live module, but the app structure supports future dashboard modules
- the web chat uses a real-time WebSocket session transport
- streamed assistant responses, typing indicators, and receipts are visible
- web and CLI share the same chat runtime semantics
- web chat behavior matches `frankenbeast chat` 1:1 for routing, continuation, approvals, and execution outcomes
- prompt injection and unauthorized socket/session access are blocked by design
