# Plan 1 — Discrepancies Pass 4 (Corrected Adversarial Audit)

> Generated 2026-03-17 and corrected after re-verifying the current branch.
> This file is not the source of truth for current status; use `DISCREPANCIES.md` first.
> The purpose of this pass is to document which earlier discrepancy claims were false or misleading.
> Historical note: several issues described as open here were fixed later. See `DISCREPANCIES-PASS8-SKEPTICAL-RECHECK.md` for the current skeptical recheck.

---

## Spec Execution Verification

The earlier "30/30 spec tasks implemented" headline was too strong. Current verification supports this narrower conclusion:

| Chunk | Tasks | Result | Notes |
|-------|-------|--------|-------|
| 01 — ProcessSupervisor | 4/4 | PASS | Three-way exit gate improvement over spec |
| 02 — Callback Wiring | 5/5 | PASS | Options-object pattern adopted early (from Chunk 06) |
| 03 — Real buildProcessSpec | 6/6 | PASS | Package-root traversal fix for spec's broken path |
| 04 — Config Passthrough | 5/5 structural tasks | PARTIAL | Schema/transport landed; several promised config fields are still not consumed |
| 05 — Error Reporting | 5/5 structural tasks | PARTIAL | The branch-owned failure-flow integration test is red |
| 06 — SSE Event Bus | 5/5 structural tasks | PARTIAL | Core wiring exists, but initial dispatch status and live-stream coverage still have gaps |

---

## Verification of DISCREPANCIES.md Claims

### Claims Confirmed TRUE

| ID | Claim | Verified At |
|----|-------|-------------|
| B.1 [fixed] | `handleProcessExit` terminal guard prevents double-write | `process-beast-executor.ts:234-249` — reads `getAttempt`, checks terminal status, returns early |
| B.2 [fixed] | Config file cleanup in spawn failure catch | `process-beast-executor.ts:129-134` — `unlinkSync` + map delete |
| B.3 [fixed] | Spawn failure publishes `run.status` to eventBus | `process-beast-executor.ts:136-139` — `eventBus.publish({ type: 'run.status', status: 'failed' })` |
| B.4 [fixed] | Spawn failure tests exist | 6 tests across 2 files (DISCREPANCIES.md says 4 — undercount) |
| A.4/B.6 [fixed] | SSE dedup guard in `syncTrackedAgent` | `beast-run-service.ts:165-167` — `if (trackedAgent.status === status) return` BEFORE `eventBus.publish` at line 169 |
| 6.7 [fixed] | `ticketStore.destroy()` wired to shutdown | `chat-server.ts:123` — called in `close()` |
| N.7 [fixed] | `model`, `maxDurationMs`, `skills` in schema | `run-config-loader.ts:41-43` — all three present |
| N.2/N.3 [fixed] | `eventBus`/`ticketStore` required on `BeastRoutesDeps` | `beast-routes.ts:50-51` — no `?`, TypeScript enforces |
| All other [fixed] | Various | Confirmed by agent scan, no regressions found |

### Claims Found FALSE or MISLEADING

#### F.0 — Headline claim "30/30 spec tasks implemented across all 6 chunks" — MISLEADING

**Why it is misleading:** It collapses "code exists for each chunk" and "the branch is functionally complete" into the same claim. That is not justified by the current branch state.

**Evidence:**

1. `tests/integration/beasts/agent-failure-flow.test.ts` currently fails on the active branch.
2. Chunk 04 still has parsed-but-unused config fields (`promptConfig`, `skills`, several git settings, and `llmConfig.overrides`).
3. Chunk 06 still misses the initial `agent.status` SSE publish for `BeastDispatchService.createRun(startNow=true)`.

**Should say:** "All six chunks have landed code, but Plan 1 is still partial because verification and some promised behaviors are incomplete."

#### F.1 — DISCREPANCIES.md 5.3 [ok]: "full idempotency guard" — MISLEADING

**What it says:** "syncTrackedAgent has full idempotency guard: `trackedAgent.status === status` early-return prevents both duplicate SSE events AND duplicate DB event appends"

**What actually happens:** The guard at line 165 is AFTER `updateTrackedAgent` at line 158. The `updateTrackedAgent` call fires unconditionally on every `syncTrackedAgent` invocation — even when status hasn't changed. Only the SSE publish (line 169) and event append (line 182) are guarded.

**Impact:** Redundant `updateTrackedAgent` DB writes on no-op calls. Not a data corruption issue (it writes the same value), but the claim "full idempotency" is inaccurate — it's partial idempotency. The SSE and event-append dedup is correct.

**Should say:** "syncTrackedAgent guards SSE publish and DB event append with `trackedAgent.status === status` check. The `updateTrackedAgent` call is unconditional (redundant but harmless writes when status unchanged)."

#### F.2 — DISCREPANCIES.md B.5/N.4 [ok]: "Initial agent.status events come from executor onRunStatusChange → syncTrackedAgent path" — FALSE

**What it says:** "BeastDispatchService doesn't emit SSE events; design gap in spec, not impl. Initial agent.status events come from executor onRunStatusChange → syncTrackedAgent path."

**What actually happens:** `ProcessBeastExecutor.start()` does NOT call `onRunStatusChange` on successful start. It only calls `onRunStatusChange` in the spawn failure catch block (line 141) and in `handleProcessExit` (line 300) / `finishAttempt` (line 343). On the `BeastDispatchService.createRun(startNow=true)` path:

1. `executor.start(run, definition)` returns successfully
2. `BeastDispatchService` updates tracked agent status to `'running'` directly via `repository.updateTrackedAgent()` at line 100-103
3. No `eventBus.publish` is called — `BeastDispatchService` has no eventBus
4. No `syncTrackedAgent` is called — `BeastDispatchService` has no reference to `BeastRunService`

**Result:** When a run is successfully created and started via `BeastDispatchService.createRun(startNow=true)`, SSE clients receive NO `agent.status` event for the `running` transition. They only see the agent's status change later when the process exits (via `handleProcessExit` → `onRunStatusChange` → `syncTrackedAgent`).

The `BeastRunService.start()` path (line 50-56) DOES call `syncTrackedAgent` after `executor.start()` — but `BeastDispatchService.createRun(startNow=true)` calls the executor directly, bypassing `BeastRunService.start()`.

**This is a real gap, not an acceptable design decision.** The [ok] tag and explanation are incorrect.

#### F.3 — DISCREPANCIES.md C.1 [remaining]: "Integration test missing exitCode assertion" — STALE/FALSE

**What it says:** "Integration test missing `exitCode` assertion from spec"

**What actually exists:** `agent-failure-flow.test.ts:103` asserts `expect(updatedRun!.latestExitCode).toBe(1)` and line 124 asserts `expect(agentFailEvent!.payload).toMatchObject({ runId: run.id, exitCode: 1 })`.

**Verdict:** The assertion exists. C.1 should be marked [fixed].

---

## Genuinely Remaining Items

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| F.0 | High | "30/30 implemented" headline overstates actual completion | Confirmed open |
| 6.5/B.15 | Low | No integration test for SSE live event delivery or `Last-Event-ID` header parsing | Confirmed open — `sse-stream.test.ts` only tests ticket/auth, not event delivery |
| C.2 | Low | No end-to-end test for spawn failure + tracked agent event propagation | Confirmed open — existing tests cover spawn failure in isolation, not through `notifyRunStatusChange` → `syncTrackedAgent` chain with a real tracked agent |
| F.2 | Medium | `BeastDispatchService.createRun(startNow=true)` publishes no SSE `agent.status` event on successful start | Confirmed open — incorrectly marked [ok] in DISCREPANCIES.md |
| F.1 | Low | `syncTrackedAgent.updateTrackedAgent` fires unconditionally (redundant writes) | Cosmetic — no data corruption, just unnecessary DB writes |
| F.4 | High | `agent-failure-flow.test.ts` is failing, so Chunk 05 cannot be called complete | Confirmed open — `lastStderrLines` does not include the expected stderr line |
| F.5 | Medium | Early buffered stdout/stderr are persisted but not published to SSE, so live clients can miss earliest process output | Confirmed open |
| F.6 | High | Config passthrough doc claims full downstream usage, but several parsed fields are still dead | Confirmed open |
| F.7 | Medium | `session.ts` silently suppresses malformed run-config errors | Confirmed open |

---

## Corrections Needed in DISCREPANCIES.md

1. **5.3**: Change description from "full idempotency guard" to "partial idempotency guard — SSE and event append are guarded, updateTrackedAgent is unconditional"
2. **B.5/N.4**: Change from `[ok]` to `[remaining]` — the claim that "initial agent.status comes from executor onRunStatusChange → syncTrackedAgent" is false for the `BeastDispatchService.createRun(startNow=true)` path
3. **C.1**: Change from `[remaining]` to `[fixed]` — exitCode assertion exists in current test
4. **B.4**: Update "4 new tests" to "6 tests across 2 files"
5. Replace "all issues resolved" / "30/30 implemented" language with partial/open wording that matches actual test and code state
6. Add the config passthrough behavioral gap and silent run-config fallback
7. Add the early `run.log` SSE gap

---

## Final Status

| Category | Count |
|----------|-------|
| Structural chunk tasks landed | 30/30 |
| Verified false or misleading claims | 7 |
| Verified current-state gaps | 8 |

### The highest-signal remaining issues

1. **F.4 — `agent-failure-flow.test.ts` is red.** Plan 1 should not be described as complete while its own failure-path integration test is failing.
2. **F.6 — Config passthrough is not fully real.** Several fields are validated and serialized but have no downstream effect.
3. **F.2 — `BeastDispatchService.createRun(startNow=true)` SSE gap.** The operator dashboard does not receive the initial `agent.status=running` event.
4. **F.7 — malformed run-config is silently swallowed.** This hides bad state instead of surfacing it early.
