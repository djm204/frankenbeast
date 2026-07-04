# ADR-027: Beast Daemon as Independent Service

- **Date:** 2026-03-16
- **Status:** Accepted (partially implemented; follow-up tracked in [#463](https://github.com/djm204/frankenbeast/issues/463))
- **Deciders:** pfk

> **Implementation status:** Partially implemented after the original ADR acceptance. The repository now ships the standalone `frankenbeast beasts-daemon` subcommand, a default `:4050` Beast API server, and `.frankenbeast/beasts-daemon.pid` lifecycle management; the historical implementation gap was tracked in [#495](https://github.com/djm204/frankenbeast/issues/495). The daemon starts through explicit `beasts-daemon`/`network` commands today; automatic lazy-start from CLI beast commands and chat dispatch remains target architecture. Current `frankenbeast beasts ...` commands still construct CLI-local beast services directly rather than talking to a running daemon. `chat-server` can still instantiate beast services in-process unless `FRANKENBEAST_BEAST_DAEMON_URL` points it at an external daemon, so operator docs should distinguish daemon deployment from CLI-local and chat-server-local wiring.

## 2026-07-01 Deploy-Beasts Decision (historical)

ADR-027 remained accepted as the target architecture for an independently
deployable beast control plane, but was temporarily **deferred until after the
deploy-beasts MVP**. That sprint routed dashboard beast deployment through the
existing `chat-server` so the container-deploy work could land without adding a
new process boundary.

Follow-on implementation was tracked in
[#463](https://github.com/djm204/frankenbeast/issues/463), which is now closed.
The standalone daemon route is partially implemented; `chat-server` may still host
local beast APIs for its own process route, and automatic daemon lazy-start from
CLI beast commands or chat dispatch remains target-only. This section is retained
as the historical deferral note that preceded the explicit daemon commands.

## Context

The beast services (process supervision, agent tracking, log management, SSE streaming) were originally instantiated inside the chat-server process via `createBeastServices()`. This coupling meant:

- Agent processes died when the chat-server restarted
- Beast API routes were only available when the chat-server was running
- The chat-server had process lifecycle management responsibilities that don't belong to it
- No clear separation of concerns between chat functionality and agent management

The dashboard, CLI, and chat-server all need to interact with agent state, but through different paths — the chat-server shouldn't be in the middle.

## Decision

Extract all beast services into a standalone **beast daemon** process (`frankenbeast beasts-daemon`) with its own HTTP API, port, and lifecycle.

**Architecture:**

```
Dashboard ──→ Beast Daemon API (:4050)
CLI ─────────→ Beast Daemon API (:4050)
Chat-server ─→ Beast Daemon API (:4050)
```

The daemon owns:
- Process spawning and supervision
- Agent/run persistence (SQLite)
- Log storage and serving
- SSE event streaming
- Health checks and stale process detection
- Graceful shutdown propagation to child processes
- Stats and error aggregation

The daemon's lifecycle:
- Starts with `frankenbeast network up` or `frankenbeast beasts-daemon`
- Target-only: lazy-starts when any consumer first needs it (CLI spawn, chat dispatch)
- Stops with `frankenbeast network down` or direct SIGTERM
- PID file at `.frankenbeast/beasts-daemon.pid` prevents double-starts

All `/v1/beasts/*` HTTP routes migrate from the chat-server to the daemon. The chat-server becomes a thin gateway for chat-only functionality.

## Consequences

### Positive
- Agents survive chat-server restarts
- Clear separation of concerns — chat is chat, agent management is agent management
- Dashboard can connect directly to the daemon without the chat-server running
- CLI and dashboard use the same API, same state, same behavior
- Daemon can be deployed and scaled independently

### Negative
- Two processes to manage instead of one (mitigated by `network up/down` and lazy-start)
- HTTP overhead for chat-server → daemon communication (negligible for agent operations)
- Operator token must be configured for the daemon separately

### Risks
- PID file can become stale if daemon is SIGKILL'd (mitigated by startup stale-PID detection)
- Port conflict if multiple daemon instances start (mitigated by PID file check before start)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep beast services in chat-server | Simpler deployment (one process) | Coupling, agents die on restart | Violates separation of concerns; unreliable agent lifecycle |
| Shared library with explicit boundary | No HTTP overhead | Still same process; shutdown coupling | Architectural boundary without process isolation is insufficient |
| Microservice with message queue | Maximum decoupling | Massive complexity increase | Overkill for a single-machine development tool |
