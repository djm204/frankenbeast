# Plan 1 — Discrepancies Pass 2 (Source-Verified)

> Generated 2026-03-17. Skeptical re-scan against specs + DISCREPANCIES.md claims.
> Every claim verified by reading actual source, not trusting docs or commit messages.
> Historical note: this pass captures an intermediate review state. Some findings here were fixed later; use `DISCREPANCIES.md` and `DISCREPANCIES-PASS5-TRUTH-AUDIT.md` for current status.

---

## Verification of DISCREPANCIES.md "fixed" claims

### 4.4 "modules naming aligned" — VERIFIED FIXED
- `RunConfigSchema` (run-config-loader.ts:42): field is `modules`
- `process-beast-executor.ts:42`: reads `run.configSnapshot.modules`
- `process-beast-executor.ts:53`: writes entire `configSnapshot` as JSON
- `dep-factory.ts:197`: reads `options.runConfig?.modules`
- Schema uses `.passthrough()` (line 46), not `.strict()`, so extra keys won't crash
- **Confirmed fixed.** Round-trip works.

### 4.8 "session.ts wraps loadRunConfigFromEnv in try/catch" — VERIFIED FIXED
- `session.ts:482-485`: `try { return loadRunConfigFromEnv(); } catch { return undefined; }`
- **Confirmed.** Bad config files won't crash session startup.

### 5.1 "Default SIGTERM timeout always applied" — VERIFIED FIXED
- `process-beast-executor.ts:179`: `const timeoutMs = options?.timeoutMs ?? this.options.defaultStopTimeoutMs ?? 10_000;`
- The escalation block (lines 178-202) is no longer conditional on `options?.timeoutMs !== undefined`. It always runs.
- `clearTimeout(timer!)` at line 191 prevents leaked timers.
- **Confirmed fixed.**

### 5.2 "Double operator_stop log removed" — VERIFIED FIXED
- `beast-run-service.ts:83`: calls `await this.executorFor(run).stop(run.id, attemptId)` — no `logs.append` after it
- `beast-run-service.ts:85`: just `const updated = this.requireRun(runId)` — no log write
- Kill path (`beast-run-service.ts:96`): calls `await this.executorFor(run).kill(run.id, attemptId)` — no `logs.append` after it
- **Confirmed fixed.** Only `finishAttempt` in the executor writes the stop reason log.

### 6.1 "SSE routes mounted in chat-app.ts" — VERIFIED FIXED
- `chat-app.ts:11`: imports `createBeastSseRoutes`
- `chat-app.ts:105-111`: conditionally mounts when `eventBus && ticketStore` present
- **Confirmed fixed.**

### 6.2 "BeastEventBus injected into create-beast-services.ts" — VERIFIED FIXED
- `create-beast-services.ts:36`: `const eventBus = new BeastEventBus()`
- `create-beast-services.ts:42-44`: passed to `ProcessBeastExecutor` as `{ onRunStatusChange: ..., eventBus }`
- `create-beast-services.ts:49`: passed to `BeastRunService` as `{ eventBus }`
- `create-beast-services.ts:58`: exposed in bundle
- **Confirmed fixed.**

### 6.3 "SseConnectionTicketStore instantiated" — VERIFIED FIXED
- `create-beast-services.ts:37`: `const ticketStore = new SseConnectionTicketStore()`
- `create-beast-services.ts:59`: exposed in bundle
- **Confirmed fixed.** But `destroy()` still not wired to shutdown (see below).

### 6.4 "SSE abort listeners consolidated with { once: true }" — VERIFIED FIXED
- `beast-sse-routes.ts:70-73`: single `addEventListener('abort', ..., { once: true })`
- **Confirmed fixed.**

### 6.10 "Leaked setTimeout cleared when exit resolves first" — VERIFIED FIXED
- `process-beast-executor.ts:191`: `clearTimeout(timer!)`
- **Confirmed fixed.**

---

## NEW Issues Found

### N.1 — `SseConnectionTicketStore.issue()` ignores the `_token` parameter

**File:** `sse-connection-ticket.ts:23`
**Severity:** Low (cosmetic / dead parameter)

Spec says `issue(token: string)` should tie the ticket to the operator token. The actual impl has `issue(_token: string)` — the parameter is explicitly marked unused with the underscore prefix. The `TicketEntry` interface no longer has a `token` field (discrepancies doc 6.11 says "dead token field removed"). This means tickets are not actually bound to any specific operator token — any valid ticket works for any operator. For a single-operator system this is fine, but the spec's intent was operator-token binding.

### N.2 — `BeastRoutesDeps.eventBus` and `ticketStore` are optional, but the SSE wiring depends on them

**File:** `beast-routes.ts:50-51`, `chat-app.ts:105`
**Severity:** Low

`BeastRoutesDeps` has `eventBus?: BeastEventBus` and `ticketStore?: SseConnectionTicketStore` as optional. `chat-app.ts:105` guards with `if (opts.beastControl.eventBus && opts.beastControl.ticketStore)`. But `createBeastServices()` always creates both and puts them in the bundle. So the guard is dead code — `eventBus` and `ticketStore` are always present when `beastControl` is present. Not a bug, just unnecessary optionality.

### N.3 — `chat-server.ts` threads `beastControl` without `eventBus`/`ticketStore`

**File:** `chat-server.ts:83`
**Severity:** Medium — **SSE routes won't mount from `startChatServer()` unless caller explicitly passes `eventBus` and `ticketStore`**

`startChatServer()` at line 83 passes `beastControl` through to `createChatApp()`:
```typescript
...(options.beastControl ? { beastControl: options.beastControl } : {}),
```

But `StartChatServerOptions.beastControl` is typed as `BeastRoutesDeps`, which has `eventBus` and `ticketStore` as **optional**. The actual caller in `run.ts:313-323`:
```typescript
beastControl: {
  ...beastServices,     // includes eventBus + ticketStore from createBeastServices()
  security: new TransportSecurityService(),
  operatorToken: beastOperatorToken,
  rateLimit: { windowMs: 60_000, max: 20 },
},
```

The spread `...beastServices` includes `eventBus` and `ticketStore` from the bundle, so **this works at the `run.ts` call site**. But `startChatServer` itself doesn't guarantee it — any other caller of `startChatServer` that provides `beastControl` without `eventBus`/`ticketStore` would silently skip SSE mounting.

**Verdict:** Works in practice for the only call site (`run.ts`), but the type contract is looser than the runtime assumption. Not a showstopper.

### N.4 — `BeastDispatchService` does NOT receive `eventBus`

**File:** `create-beast-services.ts:54`
**Severity:** Medium

`BeastDispatchService` is constructed at line 54:
```typescript
dispatch: new BeastDispatchService(repository, catalog, executors, metrics, logStore),
```

No `eventBus` is passed. This means dispatch-initiated status changes (creating runs, dispatching) don't publish to the SSE bus directly. They rely on the executor's `onRunStatusChange` callback path which eventually reaches `BeastRunService.syncTrackedAgent` which publishes `agent.status`. But the **initial run creation** (`run.created` or `run.dispatched` events) are never published to the bus.

The spec (chunk 06, Task 4) says to emit events from `BeastRunService` and `ProcessBeastExecutor` but doesn't mention `BeastDispatchService`. However, the dashboard would logically want to know when a run is created, not just when it transitions. This is a gap the spec also has.

### N.5 — `handleProcessExit` calls `onRunStatusChange` synchronously during `start()` early-exit flush

**File:** `process-beast-executor.ts:156-158`
**Severity:** Medium — potential ordering issue

If a process exits before `attemptId` is set (early-exit case), `earlyExit` is stored and flushed at line 156-158:
```typescript
if (earlyExit) {
  this.handleProcessExit(run.id, attemptId, earlyExit.code, earlyExit.signal, [...stderrTail]);
}
```

`handleProcessExit` calls `this.options.onRunStatusChange?.(run.id)` at line 270. In `create-beast-services.ts:43`, this is wired to `runService.notifyRunStatusChange(runId)`, which calls `syncTrackedAgent`. But `start()` hasn't returned yet — the caller (`BeastRunService.start()` at line 53) hasn't called `this.requireRun(runId)` or `this.syncTrackedAgent(updated)` yet. So `syncTrackedAgent` will run from the executor's callback *before* `BeastRunService.start()` does its own `syncTrackedAgent`. This double-sync could produce duplicate agent events.

The idempotency guard (`trackedAgent.status !== status`) partially protects against this — but only if the first `syncTrackedAgent` already changed the status. If both fire with the same terminal status, the second one's `trackedAgent.status` will already match `status`, so the guard prevents the duplicate event. **So it works, but it's fragile and depends on the guard.**

### N.6 — Spec chunk 04 says `loadRunConfig` is async, impl is sync, tests call it without `await`

**File:** `run-config-loader.ts:54`, spec `04_config-file-passthrough.md:215`
**Severity:** Low

DISCREPANCIES.md says this is `[ok]` — sync is pragmatic. But the spec test on line 102 uses `await loadRunConfig(configPath)`. The actual test file must NOT await since the function is sync. **The spec tests won't run as-written against the actual implementation.** This only matters if someone tries to copy-paste spec tests — they'd get a "no-floating-promises" lint warning at most, not a failure, since `await` on a non-promise returns the value. Cosmetic.

### N.7 — Spec chunk 04 includes `model` and `skills` fields; actual `RunConfigSchema` does NOT

**File:** `run-config-loader.ts:37-46` vs spec `04_config-file-passthrough.md:195-206`
**Severity:** Medium

Spec `RunConfigSchema` includes:
- `model: z.string().optional()` — **missing from actual**
- `maxDurationMs: z.number().int().optional()` — **missing from actual**
- `skills: z.array(z.string()).optional()` — **missing from actual**

Actual uses `.passthrough()` so these won't crash if present in the config file, but they won't be validated or type-safe. `dep-factory.ts` never reads `runConfig.model` (it reads `runConfig.llmConfig.default.model` instead) or `runConfig.skills`. So the spec intended a broader schema that was never consumed. The schema is narrower than the spec but covers everything `dep-factory.ts` actually reads.

DISCREPANCIES.md 4.3 says **[fixed]** with "overrides, preset, branchPattern, prCreation, mergeStrategy, text, files all added." Let me verify each:

- `overrides` in `LlmConfigSchema`: line 11 `overrides: z.record(z.string(), LlmOverrideSchema).optional()` — **present**
- `preset` in `GitConfigSchema`: line 25 — **present**
- `branchPattern`: line 27 — **present**
- `prCreation`: line 28 — **present** (as enum, spec had boolean)
- `mergeStrategy`: line 29 — **present** (as enum, spec had string)
- `text` in `PromptConfigSchema`: line 33 — **present**
- `files`: line 34 — **present**
- `model` top-level: **MISSING**
- `maxDurationMs`: **MISSING**
- `skills`: **MISSING**

**DISCREPANCIES.md 4.3 claims "[fixed]" but `model`, `maxDurationMs`, and `skills` are still missing.** The claim "all added" is inaccurate. These three spec fields were not added and `dep-factory.ts` doesn't read them, so it's arguably correct to omit them — but the discrepancies doc shouldn't claim they're fixed when they don't exist.

### N.8 — `prCreation` enum values differ from spec

**File:** `run-config-loader.ts:28` vs spec `04_config-file-passthrough.md:183`
**Severity:** Low

Spec: `prCreation: z.boolean().optional()` (boolean)
Actual: `prCreation: z.enum(['auto', 'manual', 'disabled']).optional()` (enum)

This is arguably better than the spec (more expressive), but a config file with `"prCreation": true` (matching the spec) would fail Zod validation in the actual. Since `.passthrough()` is on the outer schema but `GitConfigSchema` itself uses `.strict()`, this would actually throw. However, no existing code writes `prCreation` as a boolean, so it's a theoretical concern.

### N.9 — `SseConnectionTicketStore.destroy()` not wired to server shutdown

**File:** `create-beast-services.ts`, `chat-server.ts`
**Severity:** Low (confirmed remaining in DISCREPANCIES.md as 6.7)

`startChatServer` returns a `ChatServerHandle` with a `close()` method. `close()` only calls `closeServer(server)` — it does NOT call `ticketStore.destroy()`. The `setInterval` will keep the Node process alive after `server.close()` if no `ref()/unref()` is set. In practice, `setInterval` created by `SseConnectionTicketStore` prevents clean process exit.

**DISCREPANCIES.md correctly lists this as remaining. Confirmed still unfixed.**

### N.10 — Spec chunk 05 integration test has wrong `onStatusChange` signature

**File:** spec `05_error-reporting-dashboard.md:539-543` vs actual constructor
**Severity:** None (spec is stale, code is correct)

Spec test creates `ProcessBeastExecutor(repo, logs, supervisor, onStatusChange)` with a positional callback (4th arg). Actual constructor takes `(repo, logs, supervisor, options?: ProcessBeastExecutorOptions)` — the options object. This divergence was documented in chunk 02's discrepancy 2.1 and marked **[ok]**. Spec tests are stale but code is correct.

### N.11 — `BeastEventBus` has no `destroy()` method for cleanup

**File:** `beast-event-bus.ts`
**Severity:** Low

`SseConnectionTicketStore` has `destroy()`. `BeastEventBus` has no equivalent. It doesn't use timers so it doesn't technically need one, but there's no way to clear `this.listeners` and `this.buffer` on shutdown. For long-running servers, the buffer grows to `maxBufferSize` (1000) and stays there. This is by design (replay buffer), but there's no way to flush it.

### N.12 — `finishAttempt` publishes `run.status` event but with attempt `status` not run-level status

**File:** `process-beast-executor.ts:308-311`
**Severity:** Low

```typescript
this.options.eventBus?.publish({
  type: 'run.status',
  data: { runId, status, updatedAt: finishedAt },
});
```

Here `status` is the `BeastRunAttempt['status']` parameter (e.g., `'stopped'`), not the run's actual status from `this.repository.getRun(runId)`. In `stop()`, `finishAttempt` is called with `status: 'stopped'` — this matches the run status because `finishAttempt` sets the run to the same status (line 293-296). But semantically, `run.status` event should reflect the *run*'s status, not the *attempt*'s. They happen to be the same, but this coupling is fragile if the statuses ever diverge.

---

## Summary of remaining issues

| # | Severity | Description |
|---|----------|-------------|
| N.4 | Medium | `BeastDispatchService` has no `eventBus` — run creation events not published to SSE |
| N.5 | Medium | Early-exit flush calls `onRunStatusChange` during `start()` — potential double-sync (guarded but fragile) |
| N.7 | Medium | DISCREPANCIES.md 4.3 claims "[fixed]" but `model`, `maxDurationMs`, `skills` still missing from schema |
| N.3 | Medium | `startChatServer` type contract allows `beastControl` without `eventBus` (works in practice, loose type) |
| N.9 | Low | `SseConnectionTicketStore.destroy()` not wired to shutdown (confirmed remaining, was already known) |
| N.1 | Low | `issue(_token)` ignores token parameter — tickets not operator-bound |
| N.2 | Low | `BeastRoutesDeps.eventBus/ticketStore` optional but always provided — dead guard |
| N.6 | Low | Spec tests use `await` on sync `loadRunConfig` (cosmetic) |
| N.8 | Low | `prCreation` is enum in actual vs boolean in spec |
| N.11 | Low | `BeastEventBus` has no `destroy()` |
| N.12 | Low | `finishAttempt` publishes attempt status as run status (works but fragile coupling) |

### Action items

1. **N.7**: Update DISCREPANCIES.md 4.3 — either add `model`/`maxDurationMs`/`skills` to schema, or change "[fixed]" to "[ok] — narrower schema covers dep-factory needs, spec fields not consumed"
2. **N.4**: Decide if `BeastDispatchService` should publish `run.created`/`run.dispatched` events to SSE bus
3. **N.9**: Wire `ticketStore.destroy()` into `ChatServerHandle.close()`
4. Rest are low priority / acceptable deviations
