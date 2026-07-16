# Sprint Plan: Deploy Beasts via the Web Dashboard

**Date:** 2026-07-01
**Goal:** Let an operator deploy a Beast run from the `franken-web` dashboard, not just the CLI, with the run executing in a sandboxed container rather than a bare local process.
**Labels:** All tracking issues carry `feature` + `deploy-beasts` on [djm204/frankenbeast](https://github.com/djm204/frankenbeast).

## Current state (verified, not assumed)

- **Dashboard** (`packages/franken-web`): a real React/Vite/Zustand SPA — chat, beast dispatch, network config, and analytics pages — talking to the `frankenbeast chat-server` (Hono HTTP + WS, ADR-016) over HTTP/WebSocket. Not a stub.
- **CLI beast management** (`packages/franken-orchestrator/src/cli/beast-cli.ts`): `beasts catalog/create/spawn/list/status/logs/stop/kill/restart/resume/delete` all work today for **local process** runs.
- **Container execution already exists**: `ContainerBeastExecutor` (`packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts`) wraps `ProcessBeastExecutor` with a Docker-transforming supervisor — `docker run --rm --network none`, explicit workspace mount, env allowlist. This was implemented under **ADR-036** (`docs/adr/036-sandboxed-beast-execution.md`, Accepted 2026-05-23) as part of a security-hardening chunk. `BeastDispatchService` already resolves `executionMode` per-request and picks the right executor (`beast-dispatch-service.ts:66,202-204`).
- **What ADR-036 does not cover, confirmed missing**: no Dockerfile for the `fbeast/sandbox:latest` image the policy references (container mode cannot actually run without one), no CPU/memory/pids resource limits, no non-root enforcement, no CLI flag to request container mode, no dashboard UI to select it, and the chat/WS dispatch path never forwards `executionMode` (only the REST route does).
- **ADR-027** (`docs/adr/027-beast-daemon-independent-service.md`) describes an accepted-but-unbuilt standalone `beasts-daemon` service. Not required for this sprint's scope — tracked separately as a stretch decision.

This sprint deliberately does **not** re-decide sandboxing strategy (ADR-036 already did) or re-implement the executor (it exists). It closes the wiring and hardening gaps around it.

## Backlog

| # | Issue | Priority | Depends on |
|---|-------|----------|------------|
| [#455](https://github.com/djm204/frankenbeast/issues/455) | Wire container execution mode through chat/WS dispatch, expose container-specific run fields | P1 | — |
| [#456](https://github.com/djm204/frankenbeast/issues/456) | CLI: `--mode container` on `beasts create/spawn/status/logs` | P2 | #455 (for status/logs fields) |
| [#457](https://github.com/djm204/frankenbeast/issues/457) | Dashboard: execution-mode selection in the Beast dispatch flow | P2 | #455 (for container fields; basic dispatch already unblocked) |
| [#458](https://github.com/djm204/frankenbeast/issues/458) | Dashboard: live status/log streaming for container runs | P2 | #455; related to open bug #409 |
| [#459](https://github.com/djm204/frankenbeast/issues/459) | Build the `fbeast/sandbox` image; add resource limits + non-root enforcement | **P0** | — |
| [#460](https://github.com/djm204/frankenbeast/issues/460) | Docs: end-to-end deploy-beasts guide; fix stale CLI-stub references; surface ADR-036 in progress tracking | P3 | best done after #455-#459 |
| [#461](https://github.com/djm204/frankenbeast/issues/461) | *(stretch)* Decide whether deploy-beasts should route through the ADR-027 beast-daemon | P3 | — |

Two issues opened during initial planning (#453 ADR for container runtime, #454 implement `ContainerBeastExecutor`) were **closed as not-planned** once direct file inspection showed ADR-036 already covers that ground — see those issues' final comments for the correction and citations.

## Priority rationale

**#459 is P0**, ahead of the wiring issues, because none of the CLI/dashboard/API work produces a working deploy without an actual container image to run. Building the image and adding resource/user hardening should start first or in parallel with #455.

## Out of scope for this sprint

- Re-deciding the sandboxing approach (ADR-036 is settled).
- Remote/cloud beast deployment (evaluated and deferred — MVP scope is containerized local execution).
- Extracting the standalone beast-daemon per ADR-027 (tracked as a stretch decision in #461, not implementation work).
