# Plan 1: Foundation — Fix the Execution Pipeline

**Date:** 2026-03-16
**Status:** Approved
**Depends on:** Nothing (this is the base layer)
**Blocks:** Plan 2 (Management), Plan 3 (UX)

---

## Problem Statement

The beast control panel collects rich agent configuration via an 8-step wizard and sends it to the backend. The backend creates `TrackedAgent` and `BeastRun` records, then spawns a **stub process** (`node -e 'setTimeout(() => process.exit(0), 50)'`) that exits in 50ms without doing anything. The entire execution pipeline is fake.

Additionally:
- `ProcessSupervisor.spawn()` discards the `ChildProcess` reference — no exit handler, no stdout/stderr capture
- Process output is lost despite `stdio: 'pipe'`
- Processes that die are stuck as `running` forever in the database
- Agent config from the wizard never reaches the spawned process

---

## Section 1: ProcessSupervisor — Exit Handling + Output Capture

### Current State

`ProcessSupervisor.spawn()` (at `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`) creates a child process, extracts `pid`, and returns immediately. The `ChildProcess` object is discarded. No `on('exit')`, no `stdout.on('data')`, no `stderr.on('data')`.

### Design

**Expanded return type:**

`spawn()` returns a `SpawnedProcessHandle` that includes the PID (for external reference) while the supervisor keeps the `ChildProcess` reference internally.

**Callback-driven lifecycle:**

`spawn()` accepts a callbacks parameter:

```typescript
interface ProcessCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

spawn(spec: BeastProcessSpec, callbacks: ProcessCallbacks): Promise<SpawnedProcessHandle>;
```

- `onStdout` and `onStderr` are line-buffered via `readline.createInterface()` on each stream
- `onExit` fires on `child.on('exit')`

**Internal process registry:**

The supervisor maintains `Map<number, ChildProcess>` so `stop()` and `kill()` use the handle directly instead of `process.kill(pid)`. This eliminates PID reuse risk.

**Error reporting on exit:**

- Non-zero exit: `onExit` fires → caller writes `attempt.failed` event with `{ exitCode, signal, lastStderrLines }`
- Zero exit: `onExit` fires → caller writes `attempt.finished` event with `{ exitCode: 0 }`
- Spawn failure (ENOENT, EACCES): synchronous throw (already works), plus a `run.spawn_failed` event before throwing. Note: no `attemptId` exists at this point (the throw happens before `createAttempt`), so the event is appended with `attemptId: undefined` — this is valid since `BeastRunEvent.attemptId` is optional in the schema

**Interface update:**

`ProcessSupervisorLike` updated to include the callbacks parameter.

### Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`

---

## Section 2: ProcessBeastExecutor — Wiring Callbacks to Persistence

### Current State

`ProcessBeastExecutor.start()` (at `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`) calls `supervisor.spawn(spec)` and returns the attempt record. No connection between process lifecycle events and the database or log store.

### Design

**Callback wiring in `start()`:**

```
onStdout(line) → this.logs.append(runId, attemptId, 'stdout', line)
onStderr(line) → this.logs.append(runId, attemptId, 'stderr', line)
                 + push to circular buffer (last 50 lines)
onExit(code, signal) → this.handleProcessExit(runId, attemptId, code, signal, stderrTail)
```

**`handleProcessExit` method:**

1. Determines status: `code === 0 ? 'completed' : 'failed'`
2. Calls the existing `finishAttempt` private method for status/stopReason/finishedAt updates, **then makes a separate `repository.updateAttempt` call to set `exitCode`** on the attempt record. The existing `finishAttempt` signature (`runId, attempt, status, stopReason`) is not modified — `exitCode` is written as an additional update. Similarly, `repository.updateRun` is called to set `latestExitCode` on the run. Both fields exist in the types (`BeastRunAttempt.exitCode`, `BeastRun.latestExitCode`) but are never populated today.
3. Appends event: `attempt.finished` or `attempt.failed` with payload `{ exitCode, signal, lastStderrLines: string[] }`
4. Calls `onRunStatusChange` callback to notify the service layer

**Notification bridge:**

`ProcessBeastExecutor` accepts an optional callback in its constructor:

```typescript
onRunStatusChange?: (runId: string, status: BeastRunStatus) => void
```

`handleProcessExit` calls this after updating the DB. `BeastRunService` exposes a **public** `notifyRunStatusChange(runId: string)` method (wrapping the currently private `syncTrackedAgent`) and passes it as this callback when constructing the executor. Clean separation — executor doesn't know about tracked agents.

### Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (expose `notifyRunStatusChange` as public)
- **Extend (existing):** `packages/franken-orchestrator/tests/unit/beasts/process-beast-executor.test.ts` (file already exists — add new test cases for callback wiring, exit handling, exitCode recording)

---

## Section 3: Real `buildProcessSpec` Implementations

### Current State

All three beast definitions (`design-interview`, `chunk-plan`, `martin-loop`) in `packages/franken-orchestrator/src/beasts/definitions/` return trivial `node -e` one-liners that exit immediately.

### Design

Each definition's `buildProcessSpec` spawns a real `frankenbeast` CLI instance. The spawned process is a full frankenbeast instance with its own config, deps, and lifecycle.

**CLI entrypoint resolution:**

New utility `resolveCliEntrypoint()` returns the absolute path to `dist/cli/run.js` relative to the orchestrator package. Works in both dev (`src/`) and installed (`dist/`) contexts.

**`martin-loop` definition:**

```typescript
buildProcessSpec: (config) => ({
  command: process.execPath,  // node binary
  args: [resolveCliEntrypoint(), 'run',
    '--provider', String(config.provider),
    '--chunks', String(config.chunkDirectory)],
  env: {
    FRANKENBEAST_SPAWNED: '1',
    // Strip all CLAUDE_* env vars to prevent plugin interference
    // Note: objective is NOT passed as an env var — it is included in the
    // run config JSON file (Section 4) and read by RunConfigLoader.
    // session.ts → runExecute() reads it from RunConfig.objective.
  },
  cwd: String(config.projectRoot ?? process.cwd()),
})
```

Maps to the existing `session.ts` → `runExecute()` pipeline.

**`chunk-plan` definition:**

```typescript
buildProcessSpec: (config) => ({
  command: process.execPath,
  args: [resolveCliEntrypoint(), 'plan',
    '--design-doc', String(config.designDocPath),
    '--output-dir', String(config.outputDir)],
  env: { FRANKENBEAST_SPAWNED: '1' },
})
```

Maps to `session.ts` → `runPlan()` → `LlmGraphBuilder`.

**`design-interview` definition:**

```typescript
buildProcessSpec: (config) => ({
  command: process.execPath,
  args: [resolveCliEntrypoint(), 'interview',
    '--goal', String(config.goal),
    '--output', String(config.outputPath)],
  env: { FRANKENBEAST_SPAWNED: '1' },
})
```

Maps to the existing `InterviewLoop` in `session.ts`.

**Key details:**

- `FRANKENBEAST_SPAWNED=1` prevents plugin/hook interference (established pattern from MartinLoop spawn fixes)
- All `CLAUDE_*` env vars stripped from spawned env (same pattern)
- `design-interview` auto-dispatch: `shouldDispatchOnCreate()` in `agent-routes.ts` currently returns `false` for `design-interview` (only `chunk-plan` and `martin-loop` return `true`). **This function must be modified to return `true` for all three definition types** — the wizard path always auto-dispatches since the interview now runs as a subprocess, not a chat flow

### Files

- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/chunk-plan-definition.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/definitions/design-interview-definition.ts`
- **Create:** `packages/franken-orchestrator/src/beasts/definitions/resolve-cli-entrypoint.ts`
- **Modify:** `packages/franken-orchestrator/src/http/routes/agent-routes.ts` (shouldDispatchOnCreate)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/definitions/` (per definition)

---

## Section 4: Config File Passthrough to Spawned Processes

### Current State

Only `FRANKENBEAST_PROVIDER` and `FRANKENBEAST_CHUNK_DIRECTORY` env vars reach the spawned process. LLM overrides, module config, git presets, skills, and prompts are all lost.

### Design

**Config file approach:**

1. `ProcessBeastExecutor.start()` writes the full `run.configSnapshot` to `.frankenbeast/.build/run-configs/<runId>.json` before spawning
2. The spawned process gets `FRANKENBEAST_RUN_CONFIG=<path>` in its env
3. **Important:** The run config file is NOT loaded through `config-loader.ts` / `OrchestratorConfigSchema`. Those schemas handle orchestrator runtime config (`maxCritiqueIterations`, `maxTotalTokens`, `providers`, etc.) — a completely different shape. Instead, create a new `RunConfigLoader` in `src/cli/run-config-loader.ts` that:
   - Reads and parses the JSON file at `FRANKENBEAST_RUN_CONFIG`
   - Validates it against a new `RunConfigSchema` (Zod) that covers the wizard fields
   - Extracts orchestrator-compatible fields (`provider`, `maxTotalTokens`, etc.) and merges them into the `OrchestratorConfig` loaded by the existing `config-loader.ts`
   - Makes wizard-specific fields (`llmConfig`, `gitConfig`, `skills`, `promptConfig`, `modules`) available as a separate `RunConfig` object for `dep-factory.ts` to consume when constructing module deps
4. Priority chain for orchestrator config remains: `CLI args > env vars > config file > defaults`, with run-config fields merged at the top
5. The `dep-factory.ts` reads the `RunConfig` object to wire per-action LLM overrides, module toggles, git settings, skill selections, and prompt frontloading

**Config file schema (two layers):**

The JSON file contains both orchestrator-compatible fields and wizard-specific extensions:

```json
{
  "provider": "claude",
  "model": "claude-opus-4-6",
  "maxTotalTokens": 200000,
  "llmConfig": {
    "default": { "provider": "anthropic", "model": "claude-opus-4-6" },
    "overrides": {
      "planning": { "provider": "anthropic", "model": "claude-sonnet-4-6" }
    }
  },
  "modules": { "firewall": true, "critique": true, "governor": false },
  "gitConfig": {
    "preset": "feature-branch",
    "baseBranch": "main",
    "branchPattern": "feat/<agent-id>",
    "prCreation": true,
    "mergeStrategy": "squash"
  },
  "skills": ["code-review", "test-generation"],
  "promptConfig": {
    "text": "Focus on type safety...",
    "files": ["/path/to/context.md"]
  }
}
```

`RunConfigLoader` splits this into:
- Orchestrator fields (`provider`, `model`, `maxTotalTokens`) → merged into `OrchestratorConfig`
- Wizard fields (`llmConfig`, `modules`, `gitConfig`, `skills`, `promptConfig`) → exposed as `RunConfig`

**Why a file, not env vars:**

- Config can be arbitrarily large (prompt text, multiple file paths)
- Structured data (nested objects, arrays) survives cleanly as JSON
- Spawned process can log "loaded config from X" for debuggability
- Separate from `--config <path>` (which loads `OrchestratorConfig`) — avoids schema confusion

**Cleanup:**

Config file is deleted when the run reaches a terminal state (completed/failed/stopped) — handled in `finishAttempt`.

### Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- **Create:** `packages/franken-orchestrator/src/cli/run-config-loader.ts` (new RunConfigSchema + RunConfigLoader)
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts` (consume RunConfig for module/LLM/git/skill wiring)
- **Read (not modify):** `packages/franken-orchestrator/src/cli/config-loader.ts` (understand existing merge chain; orchestrator config loading unchanged)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/config-passthrough.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/cli/run-config-loader.test.ts`

---

## Section 5: Error Reporting to Dashboard

### Current State

When a spawned agent fails, the dashboard shows stale "running" status forever. `BeastLogStore` only contains system-level messages ("started pid=12345"), not actual process output.

### Design

After Sections 1-4, the backend has two channels the frontend already reads via polling (migrated to SSE in Plan 2):

1. **`BeastRunEvent`** — structured events per run
2. **`BeastLogStore`** — raw log lines per attempt

**On process exit (non-zero):**

- `attempt.failed` event with payload:
  ```json
  { "exitCode": 1, "signal": null, "summary": "Process exited with code 1", "lastStderrLines": ["Error: ...", "..."] }
  ```
- Last 50 stderr lines included in event payload AND written as individual log lines
- `TrackedAgentEvent` gets `agent.run.failed` with `{ runId, exitCode, summary }`
- Run and agent status updated to `failed`

**On process exit (zero):**

- `attempt.finished` event with `{ exitCode: 0, durationMs }`
- `TrackedAgentEvent` gets `agent.run.completed` with `{ runId, durationMs }`

**On spawn failure (ENOENT, EACCES, etc.):**

- `attempt.spawn_failed` event with `{ error: message, command, args }`
- Run status → `failed` immediately
- `agent.dispatch.failed` event (already exists in schema)

**On SIGTERM timeout:**

- If operator sends stop but process doesn't die within 10 seconds, escalate to SIGKILL
- `attempt.stopped` event with `{ stopReason: 'sigterm_timeout_escalated_to_sigkill' }`

This is all backend-only. The frontend's existing event/log rendering surfaces the data with zero frontend changes.

### Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (already modified in Section 2)
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (syncTrackedAgent enhancements)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/execution/error-reporting.test.ts`
- **Test:** `packages/franken-orchestrator/tests/integration/beasts/agent-failure-flow.test.ts`

---

## Section 6: SSE Endpoint on Beast Daemon

### Current State

The frontend polls every 4 seconds. No push-based updates. Status changes can be missed if they happen between polls.

### Design

**Endpoint:** `GET /v1/beasts/events/stream`

**Authentication:** Connection ticket pattern (industry standard for SSE/WebSocket auth):

1. Client calls `POST /v1/beasts/events/ticket` with bearer token
2. Server returns `{ ticket: "<uuid>" }` — single-use, expires in 30 seconds
3. Client opens `EventSource` with `?ticket=<uuid>`
4. Server validates and burns the ticket on first use
5. In-memory `Map<ticket, { token, expiresAt }>` with cleanup interval

**Event types:**

| Event | Data | When |
|-------|------|------|
| `snapshot` | `{ agents: TrackedAgentSummary[] }` | On initial connect or reconnect after gap |
| `agent.status` | `{ agentId, status, updatedAt }` | Any agent status change |
| `agent.event` | `{ agentId, event: TrackedAgentEvent }` | New tracked agent event |
| `run.status` | `{ runId, status, updatedAt }` | Any run status change |
| `run.log` | `{ runId, attemptId, stream, line }` | New log line from process |
| `run.event` | `{ runId, event: BeastRunEvent }` | New run event |

**Sequence IDs:**

Each SSE event includes `id: <sequence>` (monotonic integer). On reconnect, `EventSource` sends `Last-Event-ID`. Server replays missed events from SQLite if the gap is small (< 1000 events). If gap is too large, sends a fresh `snapshot`.

**Implementation:**

New `BeastEventBus` class:
- In-process event emitter that all services publish to (`runService.syncTrackedAgent` emits `agent.status`, `ProcessBeastExecutor` emits `run.log`, etc.)
- SSE route subscribes to the bus and serializes events to the HTTP stream
- Each connected client gets its own event listener; cleanup on disconnect

### Files

- **Create:** `packages/franken-orchestrator/src/beasts/events/beast-event-bus.ts`
- **Create:** `packages/franken-orchestrator/src/beasts/events/sse-connection-ticket.ts`
- **Create:** `packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts`
- **Modify:** `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts` (emit to event bus)
- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` (emit to event bus)
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/events/beast-event-bus.test.ts`
- **Test:** `packages/franken-orchestrator/tests/unit/beasts/events/sse-connection-ticket.test.ts`
- **Test:** `packages/franken-orchestrator/tests/integration/beasts/sse-stream.test.ts`

---

## ADRs

This plan requires the following ADRs (written as separate files):

- **ADR-029: Config file passthrough for spawned agent processes**
- **ADR-030: SSE with connection tickets for dashboard auth**

---

## Testing Strategy

- Unit tests for each modified/created file (vitest)
- Integration test: spawn a real subprocess (e.g., `node -e 'console.error("boom"); process.exit(1)'`), verify exit code, stderr capture, event recording, and status update flow
- Integration test: SSE stream connection, event delivery, reconnection with replay
- All existing tests must continue to pass (`npx turbo run test --filter=franken-orchestrator`)
