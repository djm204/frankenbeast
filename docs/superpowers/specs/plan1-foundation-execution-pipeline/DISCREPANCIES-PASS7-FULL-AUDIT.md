# Plan 1 — Discrepancies Pass 7 (Full Adversarial Audit)

> Generated 2026-03-17. Four parallel agents independently audited all 6 chunks against specs.
> Every claim verified by reading source code. No docs, commit messages, or prior discrepancy docs were trusted.
> This pass does NOT defend the discrepancy docs — it reports what the code actually does.

---

## Chunk-by-Chunk Verdict

| Chunk | Spec Tasks | Structural Code | Behavioral Completeness | Tests |
|-------|-----------|-----------------|------------------------|-------|
| 01 — ProcessSupervisor | 4/4 landed | PASS | PASS | Minor gaps (see 01-G1–G5) |
| 02 — Callback Wiring | 4/4 landed | PASS | PASS | Minor gaps (see 02-G1–G5) |
| 03 — Real buildProcessSpec | 6/6 landed | PARTIAL | **FAIL — spawned processes will crash** | Tests don't exercise CLI arg parsing |
| 04 — Config Passthrough | 5/5 landed | PARTIAL | **FAIL — 3 of 10 config field groups are dead** | No dep-factory RunConfig integration test |
| 05 — Error Reporting | 5/5 landed | PASS | PASS | eventBus path not exercised in integration test |
| 06 — SSE Event Bus | 5/5 landed | PASS | PASS | `run.event` SSE type has zero test coverage |

---

## HIGH SEVERITY

### H.1 — Chunk 03: Beast definitions pass CLI flags that don't exist in the arg parser

**Files:**
- `src/beasts/definitions/martin-loop-definition.ts:38-48` — passes `--chunks`
- `src/beasts/definitions/chunk-plan-definition.ts` — passes `--output-dir`
- `src/beasts/definitions/design-interview-definition.ts` — passes `--goal`, `--output`
- `src/cli/args.ts:192-236` — `parseArgs` uses `strict: true`

**What happens:** When any beast spawns a child process using these definitions, `parseArgs` in the spawned CLI throws `Unknown option '--chunks'` (or `--output-dir`, `--goal`, `--output`) because none of these flags are registered in the arg parser. The spawned process crashes immediately on startup.

**This is a spec bug faithfully reproduced.** The spec defined these flags but never added them to the arg parser. The implementer copied the spec's args array verbatim without verifying they are accepted.

**Test gap:** All three definition test files only check the shape of the returned `BeastProcessSpec` object. No test feeds the resulting `spec.args` through `parseArgs` to verify the spawned CLI would actually start. A single round-trip test would catch this.

**Impact:** Every beast dispatch through these definitions will fail at runtime.

### H.2 — Chunk 04: `runConfigOverrides` is populated but never consumed by any phase

**Files:**
- `src/deps.ts:196-205` — `RunConfigOverrides` type defined
- `src/cli/dep-factory.ts:528-536` — values populated into `deps.runConfigOverrides`
- `src/beast-loop.ts` — **zero references** to `deps.runConfigOverrides`
- `src/phases/*.ts` — **zero references** to `runConfigOverrides`

**Dead fields (populated, never read):**

| Field | Set at | Read at | Effect |
|-------|--------|---------|--------|
| `runConfigOverrides.mergeStrategy` | dep-factory.ts:532 | nowhere | NONE |
| `runConfigOverrides.promptConfig` | dep-factory.ts:533 | nowhere | NONE |
| `runConfigOverrides.llmOverrides` | dep-factory.ts:531 | nowhere | NONE |
| `runConfigOverrides.allowedSkills` | dep-factory.ts:534 | nowhere | NONE (duplicate — skills already filtered at construction time via `filteredSkills` wrapper) |

A config file with `mergeStrategy: "squash"`, `promptConfig: { text: "..." }`, or per-phase `llmConfig.overrides` has **zero behavioral effect**. The values pass schema validation, get stored in `runConfigOverrides`, get attached to `BeastLoopDeps`, and are then silently ignored by every phase.

**Additional dead schema fields (parsed, never extracted from the config object):**

| Field | Parsed at | Read in dep-factory | Effect |
|-------|-----------|---------------------|--------|
| `objective` | run-config-loader.ts:39 | never | NONE |
| `chunkDirectory` | run-config-loader.ts:40 | never | NONE |
| `maxDurationMs` | run-config-loader.ts:42 | never | NONE |
| `model` (top-level) | run-config-loader.ts:41 | never | NONE (superseded by `llmConfig.default.model`) |

**`prCreation` partial gap:** Only `'disabled'` has an effect (dep-factory.ts:411 checks `=== 'disabled'`). The values `'auto'` and `'manual'` produce identical behavior — both result in PR creation being enabled. No differentiation exists.

### H.3 — Chunk 04: No dep-factory RunConfig integration test exists

There is no test anywhere that verifies `createCliDeps({ ..., runConfig: { provider: 'gemini', ... } })` results in the correct provider selection, branch isolation, budget, or any other RunConfig-driven behavior. The only tests are `dep-factory-module-toggles.test.ts` and `dep-factory-providers.test.ts`, neither of which exercises `runConfig` passthrough.

---

## MEDIUM SEVERITY

### M.1 — Chunk 04: `loadRunConfigFromEnv()` called once per phase (3-4 times per session)

**File:** `src/cli/session.ts:482` inside `buildDepOptions()`

`buildDepOptions()` is called at lines 191 (interview), 267 (plan), and 350 (execute). Each call re-reads and re-parses the same JSON file from the filesystem. If the config file is modified between phases, each phase silently gets a different config. No memoization, no staleness check.

Additionally, `console.log(\`loaded config from ${filePath}\`)` at `run-config-loader.ts:71` fires on each load, spamming the spawned agent's stdout — which is captured by the parent's `onStdout` callback and written to beast logs.

### M.2 — Chunk 04: No error handling around `loadRunConfigFromEnv()`

**File:** `src/cli/run-config-loader.ts:67-73`, `src/cli/session.ts:482`

`loadRunConfigFromEnv()` calls `readFileSync` and `RunConfigSchema.parse`, both of which throw on failure. The call in `session.ts:482` is inside `buildDepOptions()` with no try/catch. A malformed config file produces a cryptic Zod validation error or JSON parse error that surfaces as an uncaught exception deep in the dep-factory setup stack. No user-facing error message.

### M.3 — Chunk 06: SSE subscribe-after-replay race condition

**File:** `src/http/routes/beast-sse-routes.ts:54-78`

The code replays missed events via `bus.replaySince(id)` (lines 57-64), then subscribes to new events via `bus.subscribe(...)` (lines 68-78). Events published between `replaySince()` returning and `subscribe()` being called are permanently lost to that SSE connection. In single-threaded Node.js this window is one microtask gap — low probability but real under load.

### M.4 — Chunk 06: `run.event` SSE type published in 4 places with ZERO test coverage

**File:** `src/beasts/execution/process-beast-executor.ts`

`run.event` is published at:
- Line 130: spawn_failed
- Line 196: attempt.started
- Line 306: attempt.finished/failed
- Line 364: attempt.stopped/finished (finishAttempt path)

No test in the entire codebase verifies that a `run.event` type event is published to the eventBus. The spawn failure test at line 527 of `process-beast-executor.test.ts` only checks `run.status` events.

### M.5 — Chunk 05: `beast-run-service-notify.test.ts` has zero tests for `agent.status` SSE publishing

**File:** `tests/unit/beasts/services/beast-run-service-notify.test.ts`

The 4 tests in this file verify DB state (tracked agent updates, event appends) but none verify that `eventBus.publish({ type: 'agent.status', ... })` is called when `notifyRunStatusChange` triggers `syncTrackedAgent`. The `agent.status` publish at `beast-run-service.ts:169` is untested from a unit test perspective. Only the dispatch service tests cover `agent.status` publishing (for the dispatch path).

### M.6 — Chunk 05: Integration test does not wire eventBus

**File:** `tests/integration/beasts/agent-failure-flow.test.ts:89-92`

```typescript
new ProcessBeastExecutor(repo, logs, supervisor, { onRunStatusChange: ... })
```

No `eventBus` is passed. The integration test verifies the DB persistence path but completely skips the SSE event publishing path. If `eventBus.publish` were broken or throwing, this test would still pass.

### M.7 — Chunk 04: `session.ts` issues path bypasses RunConfig overrides

**File:** `src/cli/session.ts:172-183`

The `runIssues` flow reads `budget` and `baseBranch` directly from `this.config` (CLI args), bypassing any RunConfig overrides. The execute path (`runExecute` at line 350) does apply RunConfig overrides through `createCliDeps(this.buildDepOptions())`. So override coverage is inconsistent: execute respects RunConfig, issues does not.

### M.8 — Chunk 04: Config file not cleaned up on `stop()` timeout or `kill()` paths

**File:** `src/beasts/execution/process-beast-executor.ts`

`finishAttempt()` (lines 339-376) is called by `stop()` (line 234) and `kill()` (line 242) but has NO config file cleanup. Config files at `.frankenbeast/.build/run-configs/{runId}.json` are only cleaned up in `handleProcessExit` (lines 316-321) and the spawn failure catch (lines 134-139). If `stop()` times out and falls through to `finishAttempt` directly, the config file is leaked. No test covers the kill() config cleanup path.

---

## LOW SEVERITY

### L.1 — Chunk 01: No test for the `close` vs `exit` ordering guarantee

The implementation uses a three-way gate (`stdoutClosed && stderrClosed && exitInfo`) to ensure `onExit` fires after all buffered output is delivered. No test verifies this ordering — a refactor back to `child.on('exit')` would silently break the guarantee.

### L.2 — Chunk 01: No test for the `!child.pid` guard

`process-supervisor.ts:53` — if `spawn()` fails to obtain a PID, the implementation throws. No test exercises this.

### L.3 — Chunk 01: No test for fallback `process.kill` ESRCH error propagation

`process-supervisor.ts:110-115, 130-135` — non-ESRCH errors on the fallback `process.kill()` path should propagate. No test verifies this.

### L.4 — Chunk 02: No test for `stop()` happy-path (process exits before timeout)

The `stop()` method races an exit promise vs a timeout. If the process exits before the timeout, `finishAttempt` is skipped and `handleProcessExit` handles cleanup. No test exercises this path — the existing stop test uses a mock supervisor that never triggers `onExit`, so it always times out.

### L.5 — Chunk 02: `finishAttempt` log append errors silently swallowed

`process-beast-executor.ts:367` — `void this.logs.append(...)` swallows any filesystem error. Systemic across both `start()` and `finishAttempt`. No test covers failure of log writes.

### L.6 — Chunk 02: Deferred circular dep closure has no null guard

**File:** `src/beasts/create-beast-services.ts:43`

```typescript
let runService: BeastRunService;
// ... executor constructed with closure: (runId) => runService.notifyRunStatusChange(runId)
// ... runService assigned later
```

If `onExit` were called synchronously during construction (it isn't today), `runService` would be `undefined`. No guard exists. Safe today, fragile to future changes.

### L.7 — Chunk 06: `BeastRoutesDeps` includes fields that `beastRoutes()` never uses

`beast-routes.ts:50-51` — `eventBus` and `ticketStore` are required on `BeastRoutesDeps` but `beastRoutes()` itself never reads them. They exist only for `chat-app.ts` to forward to `createBeastSseRoutes`. Makes the type misleading about what `beastRoutes()` needs.

### L.8 — Chunk 06: `getSnapshot` return type is untyped

`beast-sse-routes.ts:19` — `getSnapshot: () => Record<string, unknown>`. No contract between server and client on snapshot shape. The client has no guarantee about which fields exist.

### L.9 — Chunk 06: SSE subscription cleanup path untested

`beast-sse-routes.ts:74-77` — the `catch` block that calls `unsub()` when `stream.writeSSE` throws (connection closed) has no test coverage.

### L.10 — Chunk 06: SSE routes have no rate limiting

`beast-sse-routes.ts` is mounted as a separate Hono app in `chat-app.ts:106`, bypassing the rate limiting from `beast-routes.ts:66`. An unauthenticated attacker can call the ticket and stream endpoints unlimited times.

### L.11 — Chunk 05: Integration test uses 2-second sleep instead of polling

`agent-failure-flow.test.ts:98` — `await new Promise(resolve => setTimeout(resolve, 2000))`. No polling mechanism. Flake risk on slow CI machines.

### L.12 — Chunk 04: `RunConfigSchema` uses `.passthrough()` instead of spec's `.strict()`

`run-config-loader.ts:49` — allows arbitrary unknown fields. Deliberate deviation for forward compatibility, but means typos in config fields (e.g., `maxTotalToken` instead of `maxTotalTokens`) pass validation silently.

### L.13 — Chunk 04: `prCreation` is enum, spec says boolean

`run-config-loader.ts:28` — `z.enum(['auto', 'manual', 'disabled'])` vs spec's `z.boolean()`. A config with `"prCreation": true` would fail Zod validation.

### L.14 — Chunk 04: `maxTotalTokens` dropped `.int()` constraint

`run-config-loader.ts:48` — `z.number()` vs spec's `z.number().int()`. Floating-point token budgets pass validation.

### L.15 — Chunk 02: Constructor API diverges from spec (positional → options bag)

`process-beast-executor.ts:34-39` — spec prescribed `(repo, logs, supervisor, onRunStatusChange?)`, actual uses `(repo, logs, supervisor, options?)`. Better design, but spec test code is incompatible with the implementation.

### L.16 — Chunk 06: `validate(ticket)` API changed to `validate(ticket, operatorToken)`

`sse-connection-ticket.ts:33` — two args vs spec's one arg. Security improvement (verifies ticket was issued for the requesting operator). Spec test code incompatible.

---

## What Actually Works Well

These are confirmed working correctly with meaningful test coverage:

- **ProcessSupervisor three-way exit gate** — better than spec, well tested
- **ProcessBeastExecutor early-exit buffering** — handles the real race condition of `onExit` firing before `attemptId` is set
- **Terminal guard in handleProcessExit** — prevents double-write from stop/kill escalation
- **BeastEventBus** — sequence IDs, subscribe/unsubscribe, replay, buffer eviction all tested
- **SseConnectionTicketStore** — issue, validate (with token binding), TTL, single-use, cleanup wired to shutdown
- **SSE route** — ticket issuance, auth, stream delivery, snapshot on fresh connect, replay via Last-Event-ID
- **BeastDispatchService SSE events** — `agent.status` and `agent.event` published on both success and failure paths, tested
- **Spawn failure handling** — DB writes, config cleanup, eventBus publish, onRunStatusChange callback all present
- **SIGTERM-to-SIGKILL escalation** — timeout logic, clean exit detection, leaked timer prevention
- **create-beast-services.ts wiring** — all services correctly receive their dependencies including eventBus
- **Config fields that work:** provider, model, baseBranch, maxTotalTokens, modules, skills (via filter), branchPattern, prCreation='disabled'

---

## Field-Level RunConfig Consumption Matrix

| Field | Parsed | Extracted in dep-factory | Has downstream effect | Tested |
|-------|--------|------------------------|-----------------------|--------|
| `llmConfig.default.provider` | Yes | Yes (line 187) | YES — CliLlmAdapter, firewall | No dedicated test |
| `llmConfig.default.model` | Yes | Yes (line 188) | YES — CliLlmAdapter, firewall | No dedicated test |
| `llmConfig.overrides` | Yes | Yes (line 196) | **NO — stored in runConfigOverrides, never read** | No |
| `gitConfig.baseBranch` | Yes | Yes (line 189) | YES — GitBranchIsolator, PrCreator | No dedicated test |
| `gitConfig.branchPattern` | Yes | Yes (line 191) | YES — GitBranchIsolator.branchPrefix | No dedicated test |
| `gitConfig.prCreation` | Yes | Yes (line 192) | PARTIAL — only `'disabled'` has effect | No |
| `gitConfig.mergeStrategy` | Yes | Yes (line 193) | **NO — stored in runConfigOverrides, never read** | No |
| `maxTotalTokens` | Yes | Yes (line 190) | YES — observer, critique budget | No dedicated test |
| `modules` | Yes | Yes (line 203) | YES — gates module imports | Tested via dep-factory-module-toggles |
| `skills` | Yes | Yes (line 194) | YES — filteredSkills wrapper | No dedicated test |
| `promptConfig` | Yes | Yes (line 195) | **NO — stored in runConfigOverrides, never read** | No |
| `objective` | Yes | **Never** | **NO** | No |
| `chunkDirectory` | Yes | **Never** | **NO** | No |
| `maxDurationMs` | Yes | **Never** | **NO** | No |
| `model` (top-level) | Yes | **Never** | **NO** (superseded by llmConfig.default.model) | No |

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| **High** | 3 | Beast definitions pass unrecognized CLI flags (H.1); 7 config fields are dead weight (H.2); no dep-factory RunConfig test (H.3) |
| **Medium** | 8 | Config loaded 3x per session (M.1); no config error handling (M.2); SSE replay race (M.3); `run.event` untested (M.4); `agent.status` from run-service untested (M.5); integration test skips eventBus (M.6); issues path bypasses RunConfig (M.7); config file leak on stop/kill (M.8) |
| **Low** | 16 | Various test gaps, spec deviations, code smells |

### The three things that would break in production

1. **H.1** — Dispatching any beast via martin-loop, chunk-plan, or design-interview definitions will crash the spawned process immediately (`Unknown option` from strict arg parsing).
2. **H.2** — Any operator who configures `mergeStrategy`, `promptConfig`, or `llmConfig.overrides` in their run config gets zero effect. The UI/wizard may present these as configurable but they are silently discarded.
3. **M.2** — A malformed run config file crashes the entire session with no user-facing error message.
