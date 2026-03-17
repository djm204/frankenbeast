# Plan 1 — Spec vs Implementation Discrepancies

> Updated 2026-03-17 (third pass — post-fix verification).
> Items marked **[fixed]** have been resolved. Items marked **[ok]** are improvements over spec.
> Items marked **[remaining]** still need attention.

---

## Chunk 01 — ProcessSupervisor Exit Handling

**Status: Complete. No gaps.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 1.1 | Exit timing uses three-way gate (`stdoutClosed && stderrClosed && exitInfo`) via `close` events instead of spec's simple `child.on('exit')`. Guarantees all buffered output is delivered before `onExit` fires. | — | **[ok]** |
| 1.2 | Additional tests beyond spec: CLAUDE env var stripping, `pid <= 0` edge cases, already-exited process handling. | — | **[ok]** |

---

## Chunk 02 — ProcessBeastExecutor Callback Wiring

**Status: Complete. Constructor shape deliberately changed.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 2.1 | Constructor changed from positional `(repo, logs, supervisor, onRunStatusChange?)` to options object `(repo, logs, supervisor, options?: { onRunStatusChange?, eventBus?, defaultStopTimeoutMs? })`. Pre-applied from Chunk 06. All call sites updated. | Low | **[ok]** |
| 2.2 | Early-exit buffering for `onExit` firing during `supervisor.spawn()` before `attemptId` is set. Not in spec but prevents a real race condition. | — | **[ok]** |

---

## Chunk 03 — Real buildProcessSpec

**Status: Complete. No gaps.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 3.1 | `resolveCliEntrypoint` uses package-root traversal instead of spec's `__dirname`-relative `../..` navigation. Same result, less fragile. | — | **[ok]** |
| 3.2 | All definition test files add `configSchema` validation tests not in spec. | — | **[ok]** |

---

## Chunk 04 — Config File Passthrough

**Status: Complete. All schema issues resolved.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 4.1 | `loadRunConfig` and `loadRunConfigFromEnv` are **synchronous** (`readFileSync`). Spec defines them as `async` returning `Promise<RunConfig>`. Self-consistent in code, but deviates from spec API. | Low | **[ok]** — sync is pragmatic for startup |
| 4.2 | Config file base path uses `process.cwd()`. | — | **[fixed]** |
| 4.3 | `RunConfigSchema` fields aligned: `overrides`, `preset`, `branchPattern`, `prCreation`, `mergeStrategy`, `text`, `files` all added. Uses `.passthrough()` for forward compatibility. | — | **[fixed]** |
| 4.4 | `modules` naming aligned — schema field is `modules` matching what executor writes. `.passthrough()` prevents Zod rejection of extra keys. | — | **[fixed]** |
| 4.5 | `LlmOverrideSchema` fields are optional — pragmatic for partial overrides. | — | **[ok]** |
| 4.6 | `objective` and `chunkDirectory` now optional in `RunConfigSchema`. | — | **[fixed]** |
| 4.7 | Round-trip integration test added: executor writes config → `RunConfigSchema.parse()` validates it. | — | **[fixed]** |
| 4.8 | `session.ts` wraps `loadRunConfigFromEnv()` in try/catch. | — | **[fixed]** |
| 4.9 | `dep-factory.ts` wires `runConfig.modules` into module toggle resolution. | — | **[fixed]** |

---

## Chunk 05 — Error Reporting to Dashboard

**Status: Complete. All issues resolved.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 5.1 | Default SIGTERM-to-SIGKILL escalation timeout now always applied (10s default, configurable via `defaultStopTimeoutMs`). | — | **[fixed]** |
| 5.2 | Double `operator_stop` log write removed — `beast-run-service.ts` no longer duplicates the executor's log append. Same for `operator_kill`. | — | **[fixed]** |
| 5.3 | `syncTrackedAgent` has idempotency guard (skips duplicate terminal events). Not in spec but prevents data issues. | — | **[ok]** |
| 5.4 | `run.spawn_failed` event payload includes `code` field (ErrnoException code) beyond spec's `{ error, command, args }`. | — | **[ok]** |

---

## Chunk 06 — SSE Event Bus + Connection Tickets

**Status: Complete. All components wired into live server.**

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| 6.1 | `beast-sse-routes.ts` mounted in `chat-app.ts` alongside beast-routes when `eventBus` and `ticketStore` are present. | — | **[fixed]** |
| 6.2 | `BeastEventBus` injected into `create-beast-services.ts`. Passed to `ProcessBeastExecutor` options and `BeastRunService` options. `onRunStatusChange` wired via deferred closure to break circular dependency. | — | **[fixed]** |
| 6.3 | `SseConnectionTicketStore` instantiated in `create-beast-services.ts`. Exposed via `BeastServiceBundle`. | — | **[fixed]** |
| 6.4 | SSE abort listeners consolidated into single `{ once: true }` listener. | — | **[fixed]** |
| 6.5 | `Last-Event-ID` replay tested via `BeastEventBus.replaySince()` unit tests. Route-level header parsing not separately integration-tested (low risk: `parseInt` + `replaySince` call). | Low | **[remaining]** — nice to have |
| 6.6 | Buffer eviction ordering test added for `maxBufferSize`. | — | **[fixed]** |
| 6.7 | `SseConnectionTicketStore.destroy()` not wired to server shutdown hook. The `setInterval` will leak if the server is stopped. | Low | **[remaining]** — wire in server close handler |
| 6.8 | Bearer token comparison uses `crypto.timingSafeEqual`. | — | **[fixed]** |
| 6.9 | `finishAttempt` now publishes `run.status` events so operator stop/kill is visible on SSE stream. | — | **[fixed]** |
| 6.10 | Leaked `setTimeout` in `stop()` escalation cleared when exit promise resolves first. | — | **[fixed]** |
| 6.11 | Dead `token` field removed from `SseConnectionTicketStore` entries. | — | **[fixed]** |

---

## Cross-Cutting Issues

| # | Deviation | Severity | Tag |
|---|-----------|----------|-----|
| X.1 | `resolveCliEntrypoint` test file exists at `tests/unit/beasts/definitions/resolve-cli-entrypoint.test.ts` with 4 tests covering happy path, fallback, and error. | — | **[ok]** |
| X.2 | Round-trip integration test added: dispatch writes config → `RunConfigSchema.parse()` validates written file including `modules` passthrough. | — | **[fixed]** |

---

## Summary

| Chunk | Status | Remaining Issues | Notes |
|-------|--------|-----------------|-------|
| 01 | **Done** | 0 | — |
| 02 | **Done** | 0 | — |
| 03 | **Done** | 0 | — |
| 04 | **Done** | 0 | All schema issues resolved |
| 05 | **Done** | 0 | Timeout default + double-log fixed |
| 06 | **Done** | 2 low (SSE route Last-Event-ID test, ticket store shutdown hook) | All critical wiring complete |

### Remaining Low-Priority Items

1. **6.5** — Add SSE route integration test for `Last-Event-ID` header parsing
2. **6.7** — Wire `SseConnectionTicketStore.destroy()` to server shutdown
