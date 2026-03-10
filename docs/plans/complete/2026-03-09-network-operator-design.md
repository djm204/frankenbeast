# Frankenbeast Network Operator Design

**Date:** 2026-03-09
**Status:** Proposed
**Scope:** Cross-module

## Goal

Add a first-class network operator so Frankenbeast can start, stop, inspect, and configure all request-serving services from one canonical surface.

The operator must:

- start only the services enabled by canonical config
- support foreground supervision by default and detached mode on demand
- make `frankenbeast chat` network-aware without breaking standalone CLI chat
- expose the same control surface through `franken-web`
- support explicit `secure` and `insecure` modes for service secrets
- avoid plaintext secret persistence in config, operator state, or logs

## Current State

The repo already contains service fragments, but no unified supervisor:

- `frankenbeast chat-server` exists in `franken-orchestrator`
- `franken-web` can run in dashboard-chat mode through Vite
- `franken-comms` exists on the current branch and already has channel adapters plus a Hono app factory
- `docker-compose.yml` exists for supporting infrastructure

What does not exist yet:

- no `frankenbeast network` command family
- no shared service registry
- no detached service state management
- no dashboard UI for service lifecycle or network config
- no canonical secret backend abstraction for operator-managed services

## Product Surface

The operator command family should be:

- `frankenbeast network up`
- `frankenbeast network up -d`
- `frankenbeast network down`
- `frankenbeast network status`
- `frankenbeast network start <service|all>`
- `frankenbeast network stop <service|all>`
- `frankenbeast network restart <service|all>`
- `frankenbeast network logs <service|all>`
- `frankenbeast network config`
- `frankenbeast network config --set <path>=<value>`
- `frankenbeast network help`

Behavior rules:

- foreground mode supervises children directly, streams logs, and tears everything down on `Ctrl+C`
- detached mode writes operator state so later `down`, `status`, `logs`, `stop`, and `restart` commands can act on the same services
- all service selection is config-driven
- help output should read like a man page, not minimal usage text

## Command Semantics

### `network up`

`network up` resolves canonical config, determines enabled services, starts them in dependency order, waits for health, and prints the resulting URLs and health state.

Foreground mode is the default.

### `network down`

`network down` stops every service started by the operator, using persisted operator state plus live health/process verification.

### `network status`

`network status` reports:

- configured mode: `secure` or `insecure`
- selected secret backend when in `secure`
- enabled services
- running services
- URLs and ports
- health
- degraded or skipped reasons

### `network start/stop/restart`

These commands act on a single service or `all`.

Dependency behavior:

- start pulls in required dependencies automatically
- stop should refuse to strand dependents unless `--force` or an equivalent dependency-aware stop behavior is selected
- restart preserves the same runtime config projection used for the original start

### `network logs`

`logs` tails one service or all services. In detached mode it tails persisted log files. In foreground mode the operator already streams logs directly.

### `network config`

`network config` is the operator surface for runtime-relevant service configuration. It must edit canonical config, not invent a second network-only model.

Examples:

- `chat.model=claude-sonnet-4-6`
- `chat.port=3000`
- `comms.slack.enabled=true`
- `comms.slack.publicKeyRef=discord/dev/public-key`

Sensitive values should be routed into a secret backend, with config storing refs rather than raw values.

## Config Ownership

This is the key architectural rule.

The network operator owns config assembly for every service it starts.

That means:

- it loads canonical config once
- it validates once
- it determines enabled services from that config
- it projects typed runtime config per service
- it passes those resolved runtime inputs into the launched service

Services must still support standalone mode.

Standalone mode:

- service loads config from the normal local sources

Managed mode:

- operator passes resolved config at launch time

Precedence:

1. operator-passed config
2. local persisted config
3. defaults

This preserves solo service usage while letting the operator take over multi-service orchestration.

## Service Registry

Use an explicit service registry in `franken-orchestrator`.

Do not use automatic package metadata discovery for v1.

Each service registration should define:

- `id`
- `displayName`
- `kind`: `app` or `infra`
- `enabled(config): boolean`
- `dependsOn`
- `buildRuntimeConfig(config, context)`
- `start(runtimeConfig, mode)`
- `stop(state)`
- `healthcheck(state)`
- `logPath(state)`
- `configPaths`

Initial service targets:

- `chat-server`
- `dashboard-web`
- `comms-gateway`
- selected infrastructure from `docker-compose.yml` when required by enabled services

The registry must be explicit enough that `status`, `help`, and the dashboard can explain why a service is enabled, disabled, skipped, or degraded.

## Process and State Model

### Foreground mode

The operator is the process supervisor.

It should:

- spawn child processes
- merge or prefix logs by service
- wait for healthchecks
- stop in reverse dependency order on termination

### Detached mode

Detached mode writes an operator state file and service log files.

Operator state should include:

- operator mode
- service ids
- pids
- URLs and ports
- dependency graph
- log file paths
- start timestamps
- secure/insecure mode
- selected secret backend metadata, but never resolved secrets

Healthchecks are the source of truth. State files are bookkeeping only and must be treated as stale-able.

## Chat Integration

`frankenbeast chat` must become network-aware.

Desired behavior:

- first probe the local managed chat service health/availability
- if healthy, attach to the managed chat runtime instead of standing up a parallel local stack
- if not healthy, run standalone CLI chat exactly as it does today

Use healthcheck-first detection, with detached operator state as a secondary hint only.

This avoids duplicate local chat surfaces while preserving the simple one-command CLI workflow.

## Dashboard Integration

Everything the operator manages in the CLI must also be manageable in `franken-web`.

The dashboard should expose:

- service health and running state
- secure vs insecure mode
- selected secure backend
- start/stop/restart actions
- logs viewing
- canonical config editing
- dependency and degraded-state explanations

The dashboard must not reimplement orchestration logic client-side.

Instead:

- `franken-orchestrator` owns the network operator engine and API
- `franken-web` is a control-plane UI over that shared engine

## Security Modes

The operator has two explicit modes:

### `insecure`

Purpose:

- faster local/dev setup

Requirements:

- still do not persist raw secrets in canonical config, operator state, or logs we control
- use simple local handling with masking/redaction
- label the mode clearly in CLI and dashboard status

### `secure`

Purpose:

- recommended production-grade or security-conscious local operation

Requirements:

- use a pluggable secret backend abstraction
- strongly recommend `1Password` or `Bitwarden`
- also support OS-native stores on macOS, Windows, and Linux
- allow a local Frankenbeast encrypted store as a fallback, but be vocal that it is not the optimal solution

Supported secure backends:

- `1Password`
- `Bitwarden`
- macOS native secure store
- Windows native secure store
- Linux native secure store
- Frankenbeast local encrypted store

Backend setup behavior:

- detect whether the backend is installed
- detect whether it is authenticated or unlocked
- if not, drive or guide setup/auth flow
- store only refs/handles in canonical config
- resolve secrets only at launch/use time for the specific service that needs them

## Secret Handling Rules

For the initial implementation, the minimum hard rule is:

- no plaintext secrets in config, operator state, or logs we control

Beyond that, the architecture must be shaped so stronger secret handling can follow cleanly.

Hard rules:

- `network config --set` should store refs/handles for sensitive fields
- status and logs must redact sensitive fields
- detached log files must be redacted too
- crash and error paths must not dump launch env blobs or raw config fragments

Fast-follow path:

- stronger secure-mode secret backend hardening
- better master-key management
- richer backend auth flows

The implementation should make these follow-ons easy rather than baking secrets directly into ad hoc service startup code.

## API Shape

The network operator should expose backend APIs so the dashboard can use the same system:

- `GET /v1/network/status`
- `POST /v1/network/up`
- `POST /v1/network/down`
- `POST /v1/network/start`
- `POST /v1/network/stop`
- `POST /v1/network/restart`
- `GET /v1/network/logs/:service`
- `GET /v1/network/config`
- `POST /v1/network/config`

Exact route naming can change, but the backend must own the semantics.

## Recommended Package Ownership

### `packages/franken-orchestrator`

Owns:

- CLI parsing and dispatch
- service registry
- operator state store
- foreground and detached supervision
- config projection
- secret backend abstraction
- network APIs
- chat attachment detection for `frankenbeast chat`

Recommended module shape:

```text
packages/franken-orchestrator/src/
  network/
    network-config.ts
    network-config-paths.ts
    network-secrets.ts
    network-state-store.ts
    network-registry.ts
    network-supervisor.ts
    network-health.ts
    network-logs.ts
    services/
      chat-server-service.ts
      dashboard-web-service.ts
      comms-gateway-service.ts
      compose-service.ts
```

### `packages/franken-web`

Owns:

- network control pages
- config editing UI
- status and logs UI

Recommended UI shape:

```text
packages/franken-web/src/
  pages/
    network-page.tsx
  components/
    network-status-grid.tsx
    network-service-list.tsx
    network-logs-panel.tsx
    network-config-editor.tsx
  lib/
    network-api.ts
```

### `packages/franken-comms`

Must gain:

- a proper runnable server entrypoint
- support for injected managed config overrides

## Alternatives Considered

### Hardcoded always-on launcher

Rejected because it does not respect config-driven service activation.

### Package metadata auto-discovery

Rejected for v1 because the repo does not have a stable metadata contract for request-serving services.

### Force all services to run only through the operator

Rejected because standalone service usage is still important and already exists for chat-related surfaces.

## Testing Strategy

The design assumes:

- CLI parser tests for all network commands
- supervisor unit tests for dependency ordering, state, and teardown
- detached-mode tests for state/log persistence
- config-path validation tests
- redaction/no-plaintext regressions
- `chat` attach-vs-standalone behavior tests
- dashboard component tests for service control and config editing
- integration tests that actually start `chat-server`, `franken-web`, and later `franken-comms`

## Acceptance Criteria

- one canonical `frankenbeast network` command family exists
- active services are selected from canonical config
- foreground and detached modes both work
- `chat` attaches to managed chat when available and falls back cleanly when not
- dashboard and CLI use the same operator backend
- secure and insecure modes are explicit and visible
- sensitive values are not persisted in plaintext in config, operator state, or logs we control
- the design leaves a clean path for stronger secure-mode backends and richer secret integration
