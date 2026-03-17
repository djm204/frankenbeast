# Plan 1 — Current Spec vs Implementation Discrepancies

> Updated 2026-03-17 after addressing Pass 4 and Pass 5 (Truth Audit) findings.
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

**Status: Partially complete. Serialization and validation landed; full downstream usage did not.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 4.1 | `loadRunConfig` and `loadRunConfigFromEnv` are synchronous (`readFileSync`). The spec defined them as async. | Low | **[ok]** |
| 4.2 | Config files are written under `process.cwd()/.frankenbeast/.build/run-configs`. | — | **[fixed]** |
| 4.3 | `RunConfigSchema` now includes `overrides`, `preset`, `branchPattern`, `prCreation`, `mergeStrategy`, `text`, `files`, `model`, `maxDurationMs`, and `skills`. It uses `.passthrough()` for forward compatibility. | — | **[fixed]** |
| 4.4 | `modules` naming is aligned end to end: executor writes `modules`, schema validates `modules`, and `dep-factory.ts` reads `modules`. | — | **[fixed]** |
| 4.5 | `LlmOverrideSchema` fields are optional. That is looser than the spec's stricter shape but safe for partial overrides. | — | **[ok]** |
| 4.6 | `objective` and `chunkDirectory` are optional in `RunConfigSchema`. | — | **[fixed]** |
| 4.7 | A round-trip integration test verifies that executor-written config parses through `RunConfigSchema`. | — | **[fixed]** |
| 4.8 | `session.ts` now calls `loadRunConfigFromEnv()` directly without `try/catch`. Malformed config errors propagate to the caller. | Medium | **[fixed]** |
| 4.9 | `dep-factory.ts` wires `runConfig.modules`, default provider/model, `gitConfig.baseBranch`, and `maxTotalTokens` into dependency construction. | — | **[fixed]** |
| 4.10 | `llmConfig.overrides`, `gitConfig.branchPattern`, `gitConfig.prCreation`, `gitConfig.mergeStrategy`, `promptConfig`, and `skills` are parsed but not functionally consumed downstream. The spec goal said these settings should be "actually used"; that part did not land. | High | **[remaining]** |
| 4.11 | `loadRunConfigFromEnv()` now logs `"loaded config from <path>"` on successful load, fulfilling the ADR-029 debuggability promise. | Low | **[fixed]** |

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

---

## Chunk 06 — SSE Event Bus + Connection Tickets

**Status: Complete. Core wiring, SSE delivery, and connection tickets all functional.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 6.1 | `beast-sse-routes.ts` is mounted in `chat-app.ts` whenever `beastControl` is present. `eventBus` and `ticketStore` are required on `BeastRoutesDeps`. | — | **[fixed]** |
| 6.2 | `BeastEventBus` is injected from `create-beast-services.ts` into `ProcessBeastExecutor` and `BeastRunService`. | — | **[fixed]** |
| 6.3 | `SseConnectionTicketStore` is instantiated in `create-beast-services.ts` and exposed through the service bundle. | — | **[fixed]** |
| 6.4 | SSE abort cleanup uses a single `{ once: true }` abort listener. | — | **[fixed]** |
| 6.5 | There is still no integration test for actual live SSE delivery or route-level `Last-Event-ID` parsing. Existing integration coverage only exercises ticket issuance and auth rejection. | Low | **[remaining]** |
| 6.6 | Buffer eviction ordering coverage exists for `maxBufferSize`. | — | **[fixed]** |
| 6.7 | `SseConnectionTicketStore.destroy()` is wired into `ChatServerHandle.close()`. | — | **[fixed]** |
| 6.8 | Bearer token comparison uses `crypto.timingSafeEqual`. | — | **[fixed]** |
| 6.9 | `finishAttempt()` publishes `run.status` so stop/kill transitions are visible on SSE. | — | **[fixed]** |
| 6.10 | The stop-time escalation `setTimeout` is cleared if the process exits first. | — | **[fixed]** |
| 6.11 | `SseConnectionTicketStore` now stores `{ token, expiresAt }` matching ADR-030's description. | — | **[fixed]** |
| 6.12 | `BeastDispatchService.createRun(startNow=true)` publishes `agent.status` SSE event via `eventBus` for both successful start and failure paths. Covered by dedicated tests. | Medium | **[fixed]** |
| 6.13 | Early stdout/stderr buffered before `attemptId` are now flushed to both the log store AND published as `run.log` SSE events. Live subscribers receive earliest process output. | Medium | **[fixed]** |
| 6.14 | ADR-030 ticket store structure now matches implementation (`{ token, expiresAt }`). | Low | **[fixed]** |

---

## Cross-Cutting Corrections

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| X.1 | All 30 structural tasks have landed and all tests pass. Chunk 04 still has parsed-but-unused config fields (4.10); this is the only substantive remaining gap. | Low | **[ok]** |
| X.2 | `agent-failure-flow.test.ts` already contains an `exitCode` assertion. Any doc saying that assertion is missing is stale. | Low | **[fixed]** |

---

## Current Summary

| Chunk | Status | Remaining Issues | Notes |
|-------|--------|------------------|-------|
| 01 | **Done** | 0 | Better than spec |
| 02 | **Done** | 0 | Constructor/API drift only |
| 03 | **Done** | 0 | Better path resolution |
| 04 | **Partial** | 1 | Parsed-but-unused config fields (4.10) |
| 05 | **Done** | 0 | All tests passing |
| 06 | **Done** | 1 low | SSE live delivery integration test (6.5) |

## See Also

- [DISCREPANCIES-PASS5-TRUTH-AUDIT.md](./DISCREPANCIES-PASS5-TRUTH-AUDIT.md)
- [DISCREPANCIES-PASS4.md](./DISCREPANCIES-PASS4.md)
