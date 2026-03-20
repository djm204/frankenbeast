# Plan 2: Management — CLI Subcommands, Lifecycle, Multi-Agent

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract beast services into a standalone daemon, add CLI subcommands for full agent management, and implement health monitoring, concurrency limits, and git worktree isolation for multi-agent execution.

**Architecture:** Seven chunks building bottom-up: bootstrap the daemon as a Hono server, add PID-based lifecycle and lazy start, create the DaemonClient HTTP bridge, migrate beast routes from chat-server to daemon, add CLI subcommands via DaemonClient, implement health monitoring + stale process detection, and add concurrency limits with git worktree isolation.

**Tech Stack:** TypeScript, Node.js child_process, Hono, SQLite, vitest

**Spec:** `docs/superpowers/specs/2026-03-16-plan2-management-cli-lifecycle.md`
**ADRs:** `docs/adr/027-beast-daemon-independent-service.md`, `docs/adr/028-git-worktree-isolation-multi-agent.md`

---

## Chunk Index

| # | Chunk | Summary | Depends On |
|---|-------|---------|------------|
| 01 | [Beast Daemon Bootstrap](./01_beast-daemon-bootstrap.md) | Standalone Hono server, PID file, health endpoint, `beasts-daemon` subcommand | Plan 1 |
| 02 | [Daemon Lifecycle](./02_daemon-lifecycle.md) | Lazy start, PID validation, detached background spawn, graceful shutdown with child process cleanup | 01 |
| 03 | [Daemon Client](./03_daemon-client.md) | HTTP client for CLI/chat-server to talk to daemon, replaces direct service calls | 01 |
| 04 | [Route Migration](./04_route-migration.md) | Move beast-routes + agent-routes from chat-server to daemon, decouple chat-server from beast services | 01, 03 |
| 05 | [CLI Subcommands](./05_cli-subcommands.md) | `beasts list/status/stop/kill/restart/logs/delete/spawn` via DaemonClient, agent-oriented ID resolution | 03, 04 |
| 06 | [Health Monitor](./06_health-monitor.md) | Liveness probing, heartbeat file, stale process detection, daemon startup scan | 01, 04 |
| 07 | [Concurrency + Worktrees](./07_concurrency-worktrees.md) | maxConcurrentAgents limit, git worktree isolation per agent, branch namespace scoping, cleanup | 04, 06 |

---

## Dependency Graph

```
01 ─→ 02
  ╲
   → 03 ─→ 04 ─→ 05
   │       ╲
   │        → 06 → 07
   └──────→ 04
```

Chunks 02 and 03 can begin in parallel after 01. Chunk 04 requires 01 and 03. Chunk 05 requires 03 and 04. Chunk 06 requires 01 and 04. Chunk 07 requires 04 and 06.

---

## Verification (after all chunks)

```bash
npx turbo run test --filter=franken-orchestrator
npx turbo run typecheck --filter=franken-orchestrator
npx turbo run build --filter=franken-orchestrator
```

All existing tests must continue to pass.
