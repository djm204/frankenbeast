# Plan 2: Management — CLI Subcommands, Lifecycle, Multi-Agent

**Date:** 2026-03-16
**Status:** Approved
**Depends on:** Plan 1 (Foundation)
**Blocks:** Plan 3 (UX) partially — SSE consumption requires the daemon to exist

---

## Problem Statement

The CLI can only `beasts spawn`. No way to list, inspect, stop, restart, or tail logs from the terminal. CLI-spawned agents don't create `TrackedAgent` records, making them invisible to the dashboard. There's no concurrency control, no agent isolation, no health monitoring, and no graceful shutdown. The beast services are coupled to the chat-server process.

---

## Section 1: Beast Daemon as Independent Service

### Current State

Beast services (`ProcessSupervisor`, `ProcessBeastExecutor`, `BeastRunService`, etc.) are instantiated inside the chat-server's startup path via `createBeastServices()`. The chat-server owns process supervision, which means:

- Agents die when the chat-server restarts
- Beast routes are only available when the chat-server is running
- The chat-server has responsibilities it shouldn't (process lifecycle management)

### Design

**`frankenbeast beasts-daemon`** is a standalone process that owns all agent lifecycle concerns:

**Responsibilities:**
- Process spawning and supervision (`ProcessSupervisor`, `ProcessBeastExecutor`)
- Exit handling and stdout/stderr capture
- Health checks and stale process detection
- SSE event stream endpoint (from Plan 1 Section 6)
- Agent stats (run counts, durations, success/failure rates)
- Error aggregation (last N failures per agent, error categorization)
- Log serving (`BeastLogStore`)
- Shutdown propagation for all child processes
- SQLite as the persistence layer

**API surface:**

The daemon's API surface combines existing routes (migrated from chat-server) and new routes. The table below marks each:

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `GET` | `/v1/beasts/health` | Daemon health check | **New** |
| `GET` | `/v1/beasts/catalog` | Beast definitions | Migrated |
| `GET` | `/v1/beasts/agents` | List tracked agents | Migrated (from `agent-routes.ts`) |
| `GET` | `/v1/beasts/agents/:id` | Agent detail + events | Migrated |
| `POST` | `/v1/beasts/agents` | Create agent | Migrated |
| `POST` | `/v1/beasts/agents/:id/start` | Start agent | Migrated |
| `POST` | `/v1/beasts/agents/:id/stop` | Stop agent | Migrated |
| `POST` | `/v1/beasts/agents/:id/restart` | Restart agent | Migrated |
| `POST` | `/v1/beasts/agents/:id/kill` | Kill agent | Migrated |
| `POST` | `/v1/beasts/agents/:id/resume` | Resume agent | Migrated |
| `DELETE` | `/v1/beasts/agents/:id` | Delete agent | Migrated |
| `PATCH` | `/v1/beasts/agents/:id/config` | Update agent config | **New** |
| `GET` | `/v1/beasts/runs` | List runs | Migrated (from `beast-routes.ts`) |
| `GET` | `/v1/beasts/runs/:id` | Run detail | Migrated |
| `GET` | `/v1/beasts/runs/:id/logs` | Run log lines | Migrated |
| `POST` | `/v1/beasts/runs` | Create run | Migrated |
| `POST` | `/v1/beasts/runs/:id/start` | Start run | Migrated |
| `POST` | `/v1/beasts/runs/:id/stop` | Stop run | Migrated |
| `POST` | `/v1/beasts/runs/:id/kill` | Kill run | Migrated |
| `POST` | `/v1/beasts/runs/:id/restart` | Restart run | Migrated |
| `GET` | `/v1/beasts/stats` | Aggregate stats | **New** |
| `GET` | `/v1/beasts/events/stream` | SSE event stream | **New** (from Plan 1) |
| `POST` | `/v1/beasts/events/ticket` | SSE connection ticket | **New** (from Plan 1) |

**Configuration:**
- Port: `beasts.daemon.port` (default: `4050`)
- PID file: `.frankenbeast/beasts-daemon.pid`
- Auth: same operator token as existing beast routes

**Consumer architecture — three independent clients, one authoritative service:**

```
Dashboard ──→ Beast Daemon API (:4050)
CLI ─────────→ Beast Daemon API (:4050)
Chat-server ─→ Beast Daemon API (:4050)
```

No proxying, no coupling. The beast daemon can run without the chat-server. The chat-server can run without the daemon (it just can't dispatch agents). The dashboard connects to the daemon directly for beast operations.

### Files

- **Create:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts` (Hono app + server bootstrap)
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts` (PID file, health check)
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-shutdown.ts` (daemon-specific shutdown handler — NOT reusing `resilience/graceful-shutdown.ts` which is session-context-specific for BeastLoop checkpoint serialization, not child process supervision)
- **Move:** `packages/franken-orchestrator/src/http/routes/beast-routes.ts` → `src/daemon/routes/`
- **Move:** `packages/franken-orchestrator/src/http/routes/agent-routes.ts` → `src/daemon/routes/`
- **Create:** `packages/franken-orchestrator/src/daemon/routes/beast-sse-routes.ts` (SSE stream + ticket endpoints — this is a **new** file, not a migration; Plan 1 Section 6 defines the design)
- **Create:** `packages/franken-orchestrator/src/daemon/routes/beast-stats-routes.ts` (aggregate stats endpoint — **new**)
- **Modify:** `packages/franken-orchestrator/src/http/chat-server.ts` (remove beast route mounting; update `ChatBeastDispatchAdapter` and `AgentInitService` to use `DaemonClient` instead of in-process `createBeastServices()` — see note below)
- **Modify:** `packages/franken-orchestrator/src/http/chat-app.ts` (remove beast/agent route imports, replace with daemon client injection)
- **Modify:** `packages/franken-orchestrator/src/cli/args.ts` (add `'beasts-daemon'` to `Subcommand` type and `VALID_SUBCOMMANDS`)
- **Modify:** `packages/franken-orchestrator/src/cli/run.ts` (add `beasts-daemon` subcommand handler)

**Note on chat-server decoupling (finding #8):**

`ChatBeastDispatchAdapter` and `AgentInitService` are currently created inside `createChatRuntime` in `chat-server.ts` / `chat-app.ts` using in-process `createBeastServices()`. When beast services move to the daemon, these classes must be updated to use `DaemonClient` as their dispatch backend instead of calling the service layer directly. This means:
- `ChatBeastDispatchAdapter.handle()` calls `daemonClient.createAgent()` instead of `agentService.createAgent()`
- `AgentInitService.dispatchAgent()` calls `daemonClient.startAgent()` instead of `dispatchService.createRun()`
- The chat-server no longer calls `createBeastServices()` — it only needs a `DaemonClient` instance

---

## Section 2: Daemon Lifecycle

### Design

**Startup paths:**

1. **Explicit:** `frankenbeast network up` starts the daemon alongside other services
2. **Explicit:** `frankenbeast beasts-daemon` starts just the daemon
3. **Lazy:** When CLI `beasts spawn` or chat-server `POST /v1/beasts/agents` is called:
   - Check PID file at `.frankenbeast/beasts-daemon.pid`
   - If exists, validate PID is alive (`kill -0`)
   - If alive, use the running daemon
   - If stale PID file, clean up and start a new daemon
   - If no PID file, start daemon as detached background process, wait for `GET /v1/beasts/health` to return 200, then proceed

**Shutdown paths:**

1. **Explicit:** `frankenbeast network down` sends `SIGTERM` to the daemon
2. **Explicit:** `SIGTERM` / `SIGINT` directly to the daemon process
3. Shutdown sequence:
   - Stop accepting new spawn requests
   - `SIGTERM` to all child agent processes
   - Wait up to 10 seconds for exits
   - `SIGKILL` any stragglers
   - Update all running attempts to `stopped` with `stopReason: 'daemon_shutdown'`
   - Append events, flush logs
   - Remove PID file
   - Exit

**Edge case — `SIGKILL` on daemon:**

Daemon can't run shutdown hooks. Agents become orphans. Handled by the startup stale-process scan (Section 4).

### Files

- **Modify:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts`
- **Modify:** `packages/franken-orchestrator/src/daemon/daemon-lifecycle.ts`
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-client.ts` (HTTP client for CLI/chat-server to talk to daemon)
- **Test:** `packages/franken-orchestrator/tests/unit/daemon/daemon-lifecycle.test.ts`

---

## Section 3: CLI `beasts` Subcommands

### Current State

`args.ts` parses `frankenbeast beasts spawn <definition-id>`. No other subcommands. CLI-spawned runs don't create `TrackedAgent` records.

### Design

**New subcommands:**

```
frankenbeast beasts list [--status running|stopped|failed|completed] [--json]
frankenbeast beasts status <agent-id>
frankenbeast beasts stop <agent-id> [--force]
frankenbeast beasts kill <agent-id>
frankenbeast beasts restart <agent-id>
frankenbeast beasts logs <agent-id> [--follow] [--tail N]
frankenbeast beasts delete <agent-id>
frankenbeast beasts spawn <definition-id> [--params key=value ...] [--interactive]
```

**ID resolution — agent-oriented CLI:**

The current CLI (`beast-cli.ts`) is run-oriented — `beastTarget` resolves to run IDs and all operations go through `services.runs.*`. **This changes to agent-oriented:** all subcommands accept `<agent-id>` (prefixed `agent_*`). The daemon resolves agent → linked run internally. This is a conceptual shift from the current run-centric CLI.

- `status`, `stop`, `kill`, `restart`, `logs`, `resume` → daemon looks up `agent.dispatchRunId` and operates on the linked run
- `delete` → operates on the agent directly (requires stopped status)
- `list` → shows agents (not runs) — output uses `agent_*` IDs
- If an operator needs to target a specific run (multi-attempt scenario), `--run <run-id>` flag is available as an override

**`spawn` enhancements:**

- `--interactive` (default when stdin is TTY) walks through `interviewPrompts` in the terminal
- Now creates a `TrackedAgent` before dispatching — CLI-spawned agents appear in the dashboard
- `--params` accepts key=value pairs matching the definition's `configSchema`. Since `nodeParseArgs` doesn't support multiple values after a single flag, **each param is a separate flag invocation**: `--params provider=claude --params chunkDirectory=./plan-foo/`. The flag is declared with `multiple: true` in the arg definition. Custom parsing splits each value on the first `=` to produce `{ key: string, value: string }` pairs.
- If `--params` provides all required fields, skip interview
- If partial, interview only for missing fields
- Without `--interactive` and without sufficient `--params`, error with usage help

**All subcommands talk to the beast daemon** via `DaemonClient`:

- `beast-cli.ts` first ensures the daemon is running (lazy start if needed)
- Then calls the daemon's HTTP API
- Same service layer, same state, same behavior as dashboard

**`list` output (tabular, colored):**

```
ID         STATUS    DEFINITION      CREATED           PID
agent_a1   running   martin-loop     2026-03-16 14:02  12345
agent_b2   failed    chunk-plan      2026-03-16 13:58  —
```

`--json` outputs newline-delimited JSON for scripting.

**`logs --follow`:**

Connects to daemon SSE stream filtered to the specific agent's run. Falls back to polling `GET /v1/beasts/runs/:id/logs` if SSE is unavailable.

### Files

- **Modify:** `packages/franken-orchestrator/src/cli/args.ts` (new subcommands + flags)
- **Modify:** `packages/franken-orchestrator/src/cli/beast-cli.ts` (subcommand handlers via DaemonClient)
- **Create:** `packages/franken-orchestrator/src/daemon/daemon-client.ts` (if not created in Section 2)
- **Test:** `packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/cli/args-beasts.test.ts`

---

## Section 4: Health Checks + Stale Process Detection

### Design

**Liveness probing:**

`ProcessBeastExecutor` starts a periodic check (every 30s) for each running attempt:

- `process.kill(pid, 0)` — signal 0 tests if process exists without killing it
- If `ESRCH`: process is gone but exit handler never fired (race condition, zombie)
- On stale detection: mark attempt as `failed` with `stopReason: 'stale_process_detected'`, write `attempt.failed` event, push to SSE

**Heartbeat from spawned process:**

- Spawned process inherits `FRANKENBEAST_RUN_ID` and `FRANKENBEAST_HEARTBEAT_FILE` env vars
- Session pipeline touches the heartbeat file every 60s with a timestamp
- Liveness probe checks: if file exists and is older than 3 minutes, process is likely hung
- Soft signal — combined with PID check, distinguishes "alive but stuck" from "gone"
- `BeastRun.lastHeartbeatAt` (already in type) populated from heartbeat file mtime

**Cleanup on daemon startup:**

- Scan all runs with `status = 'running'` in SQLite
- For each, check if PID is alive via `process.kill(pid, 0)`
- If dead: mark as `failed` with `stopReason: 'daemon_restart_stale'`, append event

### Files

- **Create:** `packages/franken-orchestrator/src/beasts/execution/health-monitor.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (heartbeat env vars)
- **Modify:** `packages/franken-orchestrator/src/cli/session.ts` (heartbeat file touch)
- **Modify:** `packages/franken-orchestrator/src/daemon/beast-daemon.ts` (startup scan)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/health-monitor.test.ts`

---

## Section 5: Multi-Agent Concurrency + Isolation

### Design

**Concurrency limits:**

- Config field: `beasts.maxConcurrentAgents` (default: 5)
- Enforced in `BeastDispatchService.createRun()` — count runs with `status = 'running'`, reject if at limit
- Both CLI and HTTP paths hit this gate (both go through the daemon)
- Error message: `"Max concurrent agents reached (5/5). Stop a running agent or increase beasts.maxConcurrentAgents in config."`

**Git isolation via worktrees:**

- Each spawned agent gets its own git worktree
- `ProcessBeastExecutor.start()` calls `git worktree add .frankenbeast/.worktrees/<agent-id> -b beast/<agent-id>` before spawning
- Worktree path becomes `cwd` in `BeastProcessSpec`
- On completion (exit 0): worktree branch available for PR/merge
- On deletion: `git worktree remove` + `git branch -D` as cleanup
- On failure: worktree preserved for debugging; `beasts delete` cleans up

**Branch namespace isolation:** The existing `GitBranchIsolator` uses `branchPrefix + chunkId` to create branches inside the working directory. When running inside a worktree, these branches share the same ref namespace with the main repo and other agents. To prevent collisions, `GitBranchIsolator.branchPrefix` must be parameterized per-agent: the spawned process receives `FRANKENBEAST_BRANCH_PREFIX=beast/<agent-id>/` via the run config file, and `dep-factory.ts` passes this prefix when constructing `GitBranchIsolator`. This scopes all chunk branches under the agent's namespace (e.g., `beast/agent_a1/chunk-01`).

**Port conflicts:**

- Trace viewer `--verbose` gets dynamic port (`:0`, OS-assigned). Actual port logged.

**Resource tracking:**

- Each `attempt.started` event records `{ pid, worktree, startedAt }`
- `beasts list` and dashboard show which worktree each agent uses

### Files

- **Create:** `packages/franken-orchestrator/src/beasts/execution/worktree-isolator.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (worktree setup before spawn)
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts` (concurrency limit)
- **Modify:** `packages/franken-orchestrator/src/beasts/services/agent-service.ts` (worktree cleanup on delete)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/worktree-isolator.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/services/concurrency-limit.test.ts`

---

## ADRs

This plan requires the following ADRs:

- **ADR-027: Beast daemon as independent service**
- **ADR-028: Git worktree isolation for multi-agent concurrency**

---

## Future Enhancements (documented, not implemented)

See companion documents:

- `docs/plans/future/structured-event-protocol.md` — fd 3 / named pipe for richer agent → daemon communication
- `docs/plans/future/auto-retry-policies.md` — configurable retry with backoff per definition
- `docs/plans/future/resource-awareness.md` — CPU/memory capping, container executor, resource budgeting

---

## Testing Strategy

- Unit tests for each modified/created file
- Integration test: daemon startup, agent spawn, status tracking, graceful shutdown
- Integration test: CLI subcommands against a running daemon
- Integration test: concurrent agent limit enforcement
- Integration test: worktree creation and cleanup
- Integration test: stale process detection on daemon restart
- All existing tests must continue to pass
