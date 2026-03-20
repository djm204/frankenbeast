# Phase 4.5: Comms Integration — Wire Absorbed Comms into Consolidated Architecture

**Goal:** The absorbed comms subsystem (Slack/Discord/Telegram/WhatsApp) integrates directly with ChatRuntime, uses security profiles for webhook verification, and is configurable via the consolidated run-config schema.

**Dependencies:** Phase 1 (comms absorbed into orchestrator), Phase 3 (provider registry for outbound metadata), Phase 4 (security profiles for webhook verification)

**Why this matters:** Phase 1 moves the comms code into the orchestrator but keeps the localhost WebSocket bridge as-is. This phase completes the absorption by replacing the network hop with a direct in-process call, integrating with the new provider and security systems, and adding comms to the consolidated config. Without this, comms is physically inside the orchestrator but architecturally disconnected from the consolidation.

---

## Architecture

### Before (Phase 1 state)

```
Slack webhook → ChatGateway → ChatSocketBridge → ws://localhost:3737 → ChatRuntime
                                  ↑ WebSocket client
                                  ↑ Token auth required
                                  ↑ Unencrypted local traffic
```

Comms lives in `orchestrator/src/comms/` but still behaves as a separate service — opening a WebSocket to itself on localhost.

### After (Phase 4.5)

```
Slack webhook → ChatGateway → ChatRuntime.run() (direct in-process call)
```

ChatGateway is injected with a `ChatRuntime` instance. No WebSocket, no token auth, no network surface. Webhook signature verification at the edge is the single trust boundary.

### Security Improvements

| Attack Surface | Before | After |
|---------------|--------|-------|
| Localhost WebSocket port | Open — any local process can connect | Eliminated — no port |
| Token auth (ws-chat-auth) | Required — can be misconfigured or leaked | Eliminated — no auth needed |
| Message replay | Possible — capture and replay WS frames | Impossible — in-process call |
| Trust boundaries | Two: webhooks + WS auth | One: webhooks only |

## Success Criteria

- `ChatSocketBridge` and `ws` dependency removed from comms code
- ChatGateway calls `ChatRuntime.run()` directly for inbound messages
- Outbound messages include provider name and execution phase
- Each channel adapter formats provider metadata for its platform
- Webhook signature verification respects security profiles
- `comms` section exists in run-config v2 schema
- Integration test proves platform message → ChatRuntime → channel reply round-trip
- All 14 migrated comms tests still pass

## Chunks

| # | Chunk | Committable Unit | Can Parallel? |
|---|-------|-----------------|--------------|
| 01 | [Replace ChatSocketBridge with direct ChatRuntime](phase4.5-comms-integration/01_direct-runtime-integration.md) | ChatGateway ↔ ChatRuntime in-process wiring | First |
| 02 | [Provider-aware outbound formatting](phase4.5-comms-integration/02_provider-aware-outbound.md) | Outbound messages carry provider + phase metadata | After 01 + Phase 3 |
| 03 | [Security profile integration](phase4.5-comms-integration/03_webhook-security-profiles.md) | Webhook verification respects security profiles | After 01 + Phase 4 |
| 04 | [Comms config in run-config v2](phase4.5-comms-integration/04_comms-run-config.md) | `comms` section in consolidated config schema | After 01 |
| 05 | [Integration test: round-trip](phase4.5-comms-integration/05_comms-integration-test.md) | Platform message → ChatRuntime → channel reply | After 01–04 |

**Parallelism:** Chunk 01 first. Chunks 02–04 can run in parallel (each depends on 01 + a different prior phase). Chunk 05 after all.

## Risks

| Risk | Mitigation |
|------|-----------|
| ChatRuntime API changes between Phase 1 and Phase 4.5 | ChatGateway depends on `ChatRuntime.run()` signature — pin to the existing interface. If runtime changes, the adapter pattern isolates the impact. |
| Removing WS bridge breaks remote comms deployment | Remote comms (separate process) is not a v1 requirement. If needed later, add an optional WS mode behind a config flag. |
| Security profile integration couples comms to security subsystem | Keep it loose — comms reads the profile at startup and configures middleware accordingly. No runtime coupling. |
