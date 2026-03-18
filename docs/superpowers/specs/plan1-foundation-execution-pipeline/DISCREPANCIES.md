# Plan 1 — Current Spec vs Implementation Discrepancies

> Updated 2026-03-17 after addressing Pass 6 (Deep Audit) findings.
> This document describes the branch's current state, not a historical snapshot.
> Claims below are limited to what was verified in code and tests.

---

## Chunk 01 — ProcessSupervisor Exit Handling

**Status: Complete. No verified gaps.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 1.1 | Exit timing uses a three-way gate (`stdoutClosed && stderrClosed && exitInfo`) via `close` events instead of the spec's simple `child.on('exit')`. This is safer than the spec and ensures buffered output is delivered before `onExit` fires. | — | **[ok]** |
| 1.2 | Additional tests beyond spec cover CLAUDE env stripping, `pid <= 0`, and already-exited processes. | — | **[ok]** |

---

## Chunk 02 — ProcessBeastExecutor Callback Wiring

**Status: Complete. Constructor shape differs from spec.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 2.1 | Constructor changed from positional `(repo, logs, supervisor, onRunStatusChange?)` to an options object `(repo, logs, supervisor, { onRunStatusChange?, eventBus?, defaultStopTimeoutMs? })`. All call sites were updated. | Low | **[ok]** |
| 2.2 | Early-exit buffering exists for `onExit` firing before `attemptId` is set. This is an improvement over the spec and prevents a real race. | — | **[ok]** |

---

## Chunk 03 — Real buildProcessSpec

**Status: Complete. No verified gaps.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 3.1 | `resolveCliEntrypoint` uses package-root traversal instead of the spec's `__dirname`-relative navigation. Same outcome, less fragile. | — | **[ok]** |
| 3.2 | Definition tests include `configSchema` validation coverage that the spec did not require. | — | **[ok]** |

---

## Chunk 04 — Config File Passthrough

**Status: Complete. All config fields parsed and wired downstream.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 4.1 | `loadRunConfig` and `loadRunConfigFromEnv` are synchronous (`readFileSync`). The spec defined them as async. | Low | **[ok]** |
| 4.2 | Config files are written under `process.cwd()/.frankenbeast/.build/run-configs`. | — | **[fixed]** |
| 4.3 | `RunConfigSchema` now includes `overrides`, `preset`, `branchPattern`, `prCreation`, `mergeStrategy`, `text`, `files`, `model`, `maxDurationMs`, and `skills`. It uses `.passthrough()` for forward compatibility (see 4.12). | — | **[fixed]** |
| 4.4 | `modules` naming is aligned end to end: executor writes `modules`, schema validates `modules`, and `dep-factory.ts` reads `modules`. | — | **[fixed]** |
| 4.5 | `LlmOverrideSchema` fields are optional — intentional deviation from spec (see 4.13). | — | **[ok: intentional]** |
| 4.6 | `objective` and `chunkDirectory` are optional in `RunConfigSchema`. | — | **[fixed]** |
| 4.7 | A round-trip integration test verifies that executor-written config parses through `RunConfigSchema`. | — | **[fixed]** |
| 4.8 | `session.ts` now calls `loadRunConfigFromEnv()` directly without `try/catch`. Malformed config errors propagate to the caller. | Medium | **[fixed]** |
| 4.9 | `dep-factory.ts` wires `runConfig.modules`, default provider/model, `gitConfig.baseBranch`, and `maxTotalTokens` into dependency construction. | — | **[fixed]** |
| 4.10 | All previously-unwired config fields are now consumed: `branchPattern` → `GitBranchIsolator.branchPrefix`, `prCreation` → `PrCreator` disabled check, `mergeStrategy` → `RunConfigOverrides`, `skills` → skills filter wrapper on `ISkillsModule`, `promptConfig` → `RunConfigOverrides`, `llmOverrides` → `RunConfigOverrides`. Exposed via `BeastLoopDeps.runConfigOverrides` for downstream phase consumption. | High | **[fixed]** |
| 4.11 | `loadRunConfigFromEnv()` now logs `"loaded config from <path>"` on successful load, fulfilling the ADR-029 debuggability promise. | Low | **[fixed]** |
| 4.12 | **Intentional:** `RunConfigSchema` uses `.passthrough()` instead of `.strict()`. Rationale: forward compatibility — spawned agents may receive config fields from newer orchestrator versions. Unknown fields pass through without validation errors. Tested explicitly at `run-config-loader.test.ts:90-102`. | — | **[ok: intentional]** |
| 4.13 | **Intentional:** `LlmOverrideSchema` fields (`provider`, `model`) are optional, not required as spec stated. Rationale: partial overrides — a run config may override only the model without specifying a provider (inherits default). Making both required would force callers to specify redundant values. | — | **[ok: intentional]** |

---

## Chunk 05 — Error Reporting to Dashboard

**Status: Complete. All integration tests passing.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 5.1 | Default SIGTERM-to-SIGKILL escalation timeout is always applied (10s default, configurable via `defaultStopTimeoutMs`). | — | **[fixed]** |
| 5.2 | Double `operator_stop` and `operator_kill` log writes were removed from `beast-run-service.ts`. | — | **[fixed]** |
| 5.3 | `syncTrackedAgent` has a full idempotency guard: `trackedAgent.status === status` early-return before all writes — prevents duplicate `updateTrackedAgent`, SSE publishes, and event appends. | — | **[fixed]** |
| 5.4 | `run.spawn_failed` payload includes an additional `code` field beyond the spec's `{ error, command, args }`. | — | **[ok]** |
| 5.5 | `agent-failure-flow.test.ts` now passes: `attempt.failed.payload.lastStderrLines` contains `"boom"`, agent events are correct. | High | **[fixed]** |
| 5.6 | `attempt.finished` and `attempt.failed` event payloads now include `durationMs` (computed from `attemptRecord.startedAt` vs `finishedAt`). Matches spec requirement. | Low | **[fixed]** |
| 5.7 | `ProcessBeastExecutor` now publishes `run.event` SSE events for spawn_failed, attempt.started, and attempt.finished/failed transitions. | Medium | **[fixed]** |

---

## Chunk 06 — SSE Event Bus + Connection Tickets

**Status: Complete. Core wiring, SSE delivery, and connection tickets all functional.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 6.1 | `beast-sse-routes.ts` is mounted in `chat-app.ts` whenever `beastControl` is present. `eventBus` and `ticketStore` are required on `BeastRoutesDeps`. | — | **[fixed]** |
| 6.2 | `BeastEventBus` is injected from `create-beast-services.ts` into `ProcessBeastExecutor` and `BeastRunService`. | — | **[fixed]** |
| 6.3 | `SseConnectionTicketStore` is instantiated in `create-beast-services.ts` and exposed through the service bundle. | — | **[fixed]** |
| 6.4 | SSE abort cleanup uses a single `{ once: true }` abort listener. | — | **[fixed]** |
| 6.5 | Integration tests now cover live SSE delivery, snapshot on fresh connect, `Last-Event-ID` replay, monotonic IDs, and snapshot suppression on reconnect. 5 new tests in `sse-stream.test.ts`. | Low | **[fixed]** |
| 6.6 | Buffer eviction ordering coverage exists for `maxBufferSize`. | — | **[fixed]** |
| 6.7 | `SseConnectionTicketStore.destroy()` is wired into `ChatServerHandle.close()`. | — | **[fixed]** |
| 6.8 | Bearer token comparison uses `crypto.timingSafeEqual`. | — | **[fixed]** |
| 6.9 | `finishAttempt()` publishes `run.status` so stop/kill transitions are visible on SSE. | — | **[fixed]** |
| 6.10 | The stop-time escalation `setTimeout` is cleared if the process exits first. | — | **[fixed]** |
| 6.11 | `SseConnectionTicketStore` now stores `{ token, expiresAt }` matching ADR-030's description. | — | **[fixed]** |
| 6.12 | `BeastDispatchService.createRun(startNow=true)` publishes `agent.status` SSE event via `eventBus` for both successful start and failure paths. Covered by dedicated tests. | Medium | **[fixed]** |
| 6.13 | Early stdout/stderr buffered before `attemptId` are now flushed to both the log store AND published as `run.log` SSE events. Live subscribers receive earliest process output. | Medium | **[fixed]** |
| 6.14 | ADR-030 ticket store structure now matches implementation (`{ token, expiresAt }`). | Low | **[fixed]** |
| 6.15 | `SseConnectionTicketStore.validate()` now accepts `operatorToken` as second argument and verifies the stored token matches via `timingSafeEqual`. Fulfills ADR-030 token-binding requirement. | Low | **[fixed]** |
| 6.16 | `snapshot` SSE event type now implemented: sent on fresh connect (no `Last-Event-ID`) when `getSnapshot` callback is provided. Wired in `chat-app.ts` using `agents.listAgents()`. | Medium | **[fixed]** |
| 6.17 | `agent.event` SSE type now published by `BeastRunService.syncTrackedAgent()` and `BeastDispatchService` for dispatch-linked and dispatch-failed transitions. | Medium | **[fixed]** |
| 6.18 | `run.event` SSE type now published by `ProcessBeastExecutor` for spawn_failed, attempt.started, and attempt.finished/failed transitions. | Medium | **[fixed]** |

---

## Cross-Cutting Corrections

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| X.1 | All 30 structural tasks have landed and all tests pass. All config fields are now wired downstream. All 6 SSE event types implemented. | — | **[fixed]** |
| X.2 | `agent-failure-flow.test.ts` already contains an `exitCode` assertion. Any doc saying that assertion is missing is stale. | Low | **[fixed]** |
| X.3 | Pass 6 Deep Audit R3 finding ("syncTrackedAgent idempotency is partial") was incorrect. The early-return guard at line 158 fires BEFORE `updateTrackedAgent` at line 163, preventing all writes including DB. Full idempotency is correct as claimed. | — | **[ok]** |

---

## Current Summary

| Chunk | Status | Remaining Issues | Notes |
|-------|--------|------------------|-------|
| 01 | **Done** | 0 | Better than spec |
| 02 | **Done** | 0 | Constructor/API drift only |
| 03 | **Done** | 0 | Better path resolution |
| 04 | **Done** | 0 | All config fields wired; `.passthrough()` and optional LLM fields are intentional |
| 05 | **Done** | 0 | All tests passing, `durationMs` in payloads |
| 06 | **Done** | 0 | All 6 SSE event types, live delivery tests, ticket token-binding |

**No remaining issues.** All 8 findings from the Pass 6 Deep Audit have been resolved.

## See Also

- [DISCREPANCIES-PASS6-DEEP-AUDIT.md](./DISCREPANCIES-PASS6-DEEP-AUDIT.md)
- [DISCREPANCIES-PASS5-TRUTH-AUDIT.md](./DISCREPANCIES-PASS5-TRUTH-AUDIT.md)
- [DISCREPANCIES-PASS4.md](./DISCREPANCIES-PASS4.md)
