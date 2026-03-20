# Plan 1 — Discrepancies Pass 3 (Adversarial Full-Codebase Audit)

> Generated 2026-03-17. Fourth review pass with maximum skepticism.
> Every claim in DISCREPANCIES.md and DISCREPANCIES-PASS2.md re-verified against live source.
> Three parallel agents scanned all 6 chunks independently; findings cross-checked manually.
> Historical note: several findings in this pass were later fixed or superseded. Do not treat this file as the current branch status. Read `DISCREPANCIES.md` and `DISCREPANCIES-PASS5-TRUTH-AUDIT.md` for the current verified state.

---

## Part A — Stale/False Claims in Prior Discrepancy Docs

### A.1 — PASS2 N.7 is now STALE (was correct when written)

**Claim:** "`model`, `maxDurationMs`, `skills` still missing from `RunConfigSchema`"
**Current source:** `run-config-loader.ts:41-43` — all three fields are present:
```typescript
model: z.string().optional(),
maxDurationMs: z.number().int().positive().optional(),
skills: z.array(z.string()).optional(),
```
**Verdict:** Fixed since PASS2 was written. DISCREPANCIES.md 4.3 `[fixed]` is now accurate.

### A.2 — PASS2 N.9 is now STALE (was correct when written)

**Claim:** "`SseConnectionTicketStore.destroy()` not wired to shutdown — confirmed remaining"
**Current source:** `chat-server.ts:122-125`:
```typescript
close: async () => {
  options.beastControl?.ticketStore.destroy();
  await closeServer(server);
},
```
**Verdict:** Fixed since PASS2 was written. DISCREPANCIES.md 6.7 should be updated to `[fixed]`.

### A.3 — PASS2 N.2 / N.3 are now STALE (type tightened)

**Claim:** "`BeastRoutesDeps.eventBus/ticketStore` optional — dead guard in chat-app.ts"
**Current source:** `beast-routes.ts:50-51` — both fields are **required** (no `?`):
```typescript
eventBus: BeastEventBus;
ticketStore: SseConnectionTicketStore;
```
`chat-app.ts:105-109` mounts SSE routes unconditionally within `if (opts.beastControl)` — no dead guard.
**Verdict:** The type contract is now tight. TypeScript enforces both fields. PASS2 N.2 and N.3 are resolved.

### A.4 — DISCREPANCIES.md 5.3 `[ok]` claim is MISLEADING

**Claim:** "idempotency guard prevents duplicate terminal events"
**Actual:** The guard at `beast-run-service.ts:170-171` only prevents duplicate **DB event appends**. The `eventBus.publish` call at line 164 fires on **every** `syncTrackedAgent` call with no dedup. If `syncTrackedAgent` is called twice for the same terminal status (e.g., early-exit flush + `start()` return path), duplicate `agent.status` SSE events are published.
**Verdict:** Guard is partial. DB events are deduped; SSE events are not.

### A.5 — DISCREPANCIES.md 6.1 description is STALE

**Claim:** "conditionally mounts when `eventBus && ticketStore` present"
**Actual:** SSE routes now mount unconditionally within `if (opts.beastControl)` at `chat-app.ts:105-109`. The conditional guard was removed when `eventBus`/`ticketStore` became required on `BeastRoutesDeps`.
**Verdict:** Description inaccurate (the outcome is correct, the mechanism changed).

---

## Part B — NEW Issues Found (not in any prior pass)

### B.1 — `stop()` / `kill()` double-write race: `finishAttempt` then `handleProcessExit` overwrites

**File:** `process-beast-executor.ts:173-213`
**Severity:** Medium

When `stop()` times out:
1. `finishAttempt()` writes `status='stopped'`, `stopReason='operator_stop'` to both attempt and run
2. `supervisor.kill(pid)` sends SIGKILL
3. When SIGKILL lands, `handleProcessExit` fires and overwrites with `status='failed'`, `stopReason='signal_SIGKILL'`

The `exitPromises` entry is deleted at line 194 before `supervisor.kill()`, so `handleProcessExit` won't resolve any promise — but it still executes its full DB write path (`updateAttempt`, `updateRun`, `appendEvent`, `onRunStatusChange`).

Same issue in `kill()` (line 207-213): `finishAttempt()` writes `stopped/operator_kill`, then `handleProcessExit` overwrites with `failed/signal_SIGKILL`.

Final DB state: `failed` (not `stopped`). The operator's intent was `stopped`.

**No test covers this scenario.** No spec addresses it.

### B.2 — Config file not cleaned up on `stop()` / `kill()` paths

**File:** `process-beast-executor.ts:258-263` (cleanup), `281-315` (`finishAttempt`)
**Severity:** Medium

Config files at `.frankenbeast/.build/run-configs/<runId>.json` are only cleaned up in `handleProcessExit`. The `finishAttempt` method (called by `stop()` and `kill()`) never cleans up. If a run is operator-stopped and the process exits cleanly (not through SIGKILL), `handleProcessExit` eventually fires and cleans up. But in the race scenario from B.1 where `finishAttempt` runs first, the config file *is* eventually cleaned up by the subsequent `handleProcessExit`. However, if `handleProcessExit` never fires (e.g., process is somehow zombie), the config file persists forever.

### B.3 — Spawn failure does NOT publish `run.status` to event bus

**File:** `process-beast-executor.ts:107-131`
**Severity:** Medium

The spawn failure `catch` block calls `this.options.onRunStatusChange?.(run.id)` (line 129) but does NOT call `this.options.eventBus?.publish(...)`. Both `handleProcessExit` (line 265) and `finishAttempt` (line 308) publish `run.status` events — but the spawn failure path bypasses both. SSE clients watching the stream will not see the run transition to `failed` on spawn failure.

### B.4 — Spawn failure `try/catch` block is entirely UNTESTED

**File:** `process-beast-executor.ts:107-131`
**Severity:** High (untested production code path)

No test in the codebase exercises the `try/catch` around `supervisor.spawn()`. The spawn failure handling writes to `repository.updateRun`, `repository.appendEvent`, and calls `onRunStatusChange` — none of these paths have test coverage. A regression here would be invisible.

### B.5 — `BeastDispatchService.createRun(startNow: true)` bypasses event bus entirely

**File:** `beast-dispatch-service.ts:92-143`, `create-beast-services.ts:54`
**Severity:** Medium

`BeastDispatchService` has no `eventBus`. When `startNow: true`:
- **Success path** (line 99-104): Updates tracked agent to `running` via `repository.updateTrackedAgent` directly — no `eventBus.publish`, no `syncTrackedAgent`
- **Failure path** (line 122-137): Updates tracked agent to `failed` via `repository.updateTrackedAgent` directly — no `eventBus.publish`, no `syncTrackedAgent`

SSE dashboard clients will not see the initial `agent.status` change to `running` or `failed` when dispatched with `startNow: true`. They only see subsequent status changes from `ProcessBeastExecutor` callbacks (which go through `BeastRunService.notifyRunStatusChange` → `syncTrackedAgent`).

The `run.created` event is only appended to the DB (line 59-67) — never published to the SSE bus.

### B.6 — `syncTrackedAgent` publishes duplicate `agent.status` SSE events on early-exit

**File:** `beast-run-service.ts:164`, `process-beast-executor.ts:156-158`
**Severity:** Low-Medium

When a process exits before `attemptId` is set (early-exit), the flush at `process-beast-executor.ts:156-158` calls `handleProcessExit` → `onRunStatusChange` → `syncTrackedAgent` → `eventBus.publish('agent.status')`. Then `start()` returns to `beast-run-service.ts:54-55`, which calls `syncTrackedAgent(updated)` → `eventBus.publish('agent.status')` again.

The DB event guard (line 170-171) prevents the second DB append, but line 164 publishes the SSE event unconditionally both times. Dashboard receives two `agent.status` events for the same transition.

### B.7 — `replaySince()` returns partial buffer, not empty, when gap is too large

**File:** `beast-event-bus.ts:47-49`
**Severity:** Low

The spec comment said "returns empty (caller should send snapshot)" when the gap exceeds buffer size. The implementation returns whatever remains in the buffer — a partial replay. The test at `beast-event-bus.test.ts` validates the actual behavior (partial), not the spec behavior (empty). A reconnecting client cannot distinguish "fully caught up" from "missed events silently dropped."

### B.8 — `_token` parameter discarded in `SseConnectionTicketStore.issue()`

**File:** `sse-connection-ticket.ts:23`
**Severity:** Low

`issue(_token: string)` — the underscore prefix marks it unused. Tickets are not bound to operator tokens. ADR-030 specified `Map<string, { token: string, expiresAt: number }>` as the data structure. The actual `TicketEntry` has only `{ expiresAt: number }`. No way to revoke tickets by operator token.

### B.9 — `LlmOverrideSchema` makes `provider` and `model` optional; spec required them

**File:** `run-config-loader.ts:4-7`
**Severity:** Low

Spec: `z.object({ provider: z.string(), model: z.string() }).strict()`
Actual: `z.object({ provider: z.string().optional(), model: z.string().optional() }).strict()`

An override entry of `{}` passes validation, which is semantically meaningless. `dep-factory.ts` safely falls back with `??` operators, so no runtime crash.

### B.10 — `prCreation` is `z.enum()` not `z.boolean()` as spec defined

**File:** `run-config-loader.ts:28`
**Severity:** Low

Spec: `prCreation: z.boolean().optional()`
Actual: `prCreation: z.enum(['auto', 'manual', 'disabled']).optional()`

A config with `"prCreation": true` (matching the spec) would fail Zod validation. `GitConfigSchema` uses `.strict()`, so the error would surface at parse time. No existing code writes a boolean, so theoretical only.

### B.11 — `gitConfig.branchPattern`, `prCreation`, `mergeStrategy`, `promptConfig`, `skills` are parsed but never consumed

**File:** `run-config-loader.ts:27-34,43`, `dep-factory.ts:187-197`
**Severity:** Low

These fields pass Zod validation but `dep-factory.ts` never reads them. They are dead config fields — validated then discarded. Only `llmConfig.default.provider`, `llmConfig.default.model`, `gitConfig.baseBranch`, `maxTotalTokens`, and `modules` are actually wired through.

### B.12 — `session.ts` re-evaluates `loadRunConfigFromEnv()` on every `buildDepOptions()` call

**File:** `session.ts:470-487`
**Severity:** Low

`buildDepOptions()` is private and called once per phase (interview, plan, execute). Each call re-reads and re-parses the config file from the env var. The spec intended a single load at startup. Functionally harmless (env var won't change mid-process) but wasteful.

### B.13 — `BeastEventBus` has no `destroy()` method

**File:** `beast-event-bus.ts`
**Severity:** Low

`SseConnectionTicketStore` has `destroy()` wired to server close. `BeastEventBus` has no equivalent. It doesn't use timers, so it doesn't leak — but there's no way to clear the listener set or replay buffer on shutdown. Buffer grows to `maxBufferSize` (1000) and stays there. By design, but no cleanup path.

### B.14 — `finishAttempt` publishes attempt status as `run.status` event

**File:** `process-beast-executor.ts:308-311`
**Severity:** Low

```typescript
this.options.eventBus?.publish({
  type: 'run.status',
  data: { runId, status, updatedAt: finishedAt },
});
```

`status` here is the attempt's status parameter (`'stopped'`), not fetched from `this.repository.getRun(runId)`. The run status is set to the same value at lines 293-296, so they match today. But this coupling is fragile — if run-level status ever diverges from attempt status, the SSE event would be wrong.

### B.15 — No test for SSE live event delivery

**File:** `tests/integration/beasts/sse-stream.test.ts`
**Severity:** Low

The SSE integration test covers ticket issuance, bad bearer token, and bad ticket — but no test publishes an event to the bus and verifies it arrives over the HTTP SSE stream. The `stream.writeSSE()` call path in `beast-sse-routes.ts` is untested.

### B.16 — Race window between `replaySince` and `subscribe` in SSE route

**File:** `beast-sse-routes.ts:43-57`
**Severity:** Low

The replay loop runs first (lines 43-55), then `bus.subscribe()` is called at line 57. Events published between the last `await stream.writeSSE()` in the replay loop and the `subscribe()` call are silently dropped. In single-threaded Node.js this window is a single microtask gap — low probability but real.

---

## Part C — Integration test gaps

### C.1 — `agent-failure-flow.test.ts` missing assertions from spec

**File:** spec `05_error-reporting-dashboard.md:565-584`
**Severity:** Low

Spec test asserts `attempt.exitCode === 1` — actual test does not assert this.
Spec test asserts `statusChanges` callback array — actual test does not capture or assert callback firing.

### C.2 — No test for spawn failure with tracked agent event propagation

**Severity:** Low

When spawn fails AND a `trackedAgentId` is set, the `onRunStatusChange` callback fires → `notifyRunStatusChange` → `syncTrackedAgent` should append an `agent.run.failed` event. No test verifies this end-to-end path.

---

## Summary

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| B.4 | **High** | Test gap | Spawn failure `try/catch` (lines 107-131) entirely untested |
| B.1 | Medium | Race condition | `stop()`/`kill()` double-write: `finishAttempt` then `handleProcessExit` overwrites status |
| B.3 | Medium | Event gap | Spawn failure doesn't publish `run.status` to event bus |
| B.5 | Medium | Event gap | `BeastDispatchService.createRun(startNow)` bypasses event bus for all status changes |
| B.6 | Low-Med | Duplicate events | `syncTrackedAgent` publishes duplicate `agent.status` SSE events on early-exit |
| B.2 | Medium | Resource leak | Config file cleanup missing from `finishAttempt` (mitigated by B.1 double-write) |
| A.4 | Low-Med | False claim | DISCREPANCIES.md 5.3 says guard prevents duplicate events — only prevents DB dupes, not SSE |
| B.7 | Low | Behavioral | `replaySince` returns partial buffer, not empty, contradicting spec comment |
| B.8 | Low | ADR violation | `_token` parameter discarded — ADR-030 data structure not matched |
| B.9 | Low | Schema | `LlmOverrideSchema` fields optional vs spec's required |
| B.10 | Low | Schema | `prCreation` enum vs spec's boolean |
| B.11 | Low | Dead config | 5 schema fields parsed but never consumed downstream |
| B.12 | Low | Inefficiency | Config re-loaded on every `buildDepOptions()` call |
| B.13 | Low | No cleanup | `BeastEventBus` has no `destroy()` |
| B.14 | Low | Fragile coupling | `finishAttempt` uses attempt status as run status in SSE event |
| B.15 | Low | Test gap | SSE live delivery path untested |
| B.16 | Low | Race | Replay-to-subscribe gap can drop events on reconnect |
| C.1 | Low | Test gap | Integration test missing `exitCode` and callback assertions from spec |
| C.2 | Low | Test gap | Spawn failure + tracked agent event propagation untested |

### Stale items from prior passes (now fixed)

| Prior ID | Was | Now |
|----------|-----|-----|
| PASS2 N.7 | `model`/`maxDurationMs`/`skills` missing | Fixed — all three in `RunConfigSchema` |
| PASS2 N.9 | `ticketStore.destroy()` not wired | Fixed — `chat-server.ts:123` |
| PASS2 N.2 | `eventBus`/`ticketStore` optional on `BeastRoutesDeps` | Fixed — both required |
| PASS2 N.3 | Loose type contract on `startChatServer` | Fixed — `BeastRoutesDeps` enforces required fields |
| DISC 6.7 | `[remaining]` | Should be `[fixed]` |

### Priority action items

1. **B.4**: Write test for spawn failure path — this is the highest-risk untested code
2. **B.1**: Add guard in `handleProcessExit` to skip DB writes if attempt is already terminal (prevents double-write from stop/kill escalation)
3. **B.3**: Add `eventBus.publish({ type: 'run.status', ... })` to spawn failure catch block
4. **B.5**: Decide if `BeastDispatchService` should receive `eventBus` or if the missing SSE events are acceptable
5. **A.4**: Add `trackedAgent.status !== status` guard before `eventBus.publish` in `syncTrackedAgent` to prevent duplicate SSE events
6. Update DISCREPANCIES.md: change 6.7 to `[fixed]`, update 5.3 description, update 6.1 description
