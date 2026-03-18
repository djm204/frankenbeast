# Plan 1 — Pass 6 Deep Audit (Code-Verified)

> Generated 2026-03-17 by independent code audit.
> Every claim below was verified by reading source code and tests — no doc was taken at face value.

---

## Methodology

Six parallel agents audited each chunk spec against the actual implementation files, tests, and cross-cutting concerns. Claims marked TRUE were verified in source. FALSE means the code contradicts the doc. STALE means a prior discrepancy doc makes a claim that the current code has already resolved.

---

## Chunk 01 — ProcessSupervisor Exit Handling

**Verdict: COMPLETE. Implementation exceeds spec.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 1.A | `onExit` uses `child.on('close')` not `child.on('exit')` | Info | Spec says `child.on('exit')`. Code uses `child.on('close')` with a three-way gate (`stdoutClosed && stderrClosed && exitInfo`). This is MORE CORRECT — Node.js `exit` can fire before stdio streams flush, losing final output lines. The `maybeFireExit()` coordination function (process-supervisor.ts:62-71) is not in the spec at all. |
| 1.B | `stripClaudeEnvVars` param type differs | Info | Spec: `Record<string, string \| undefined>`. Code: `NodeJS.ProcessEnv` (process-supervisor.ts:26). Functionally equivalent, code is more precise. |
| 1.C | `stop()`/`kill()` check `pid <= 0` before registry lookup | Info | Spec checks after. Code checks first (process-supervisor.ts:97,119). More efficient, same behavior. |

**No gaps. No false claims in DISCREPANCIES.md for this chunk.**

---

## Chunk 02 — ProcessBeastExecutor Callback Wiring

**Verdict: COMPLETE. Constructor signature differs from spec.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 2.A | Constructor is options-object, not positional | Low | Spec: `(repo, logs, supervisor, onRunStatusChange?)`. Code: `(repo, logs, supervisor, options: ProcessBeastExecutorOptions = {})` where options includes `onRunStatusChange?`, `eventBus?`, `defaultStopTimeoutMs?` (process-beast-executor.ts:24-28, 34-39). All call sites updated. |
| 2.B | Early-exit buffering not in spec | Info | Code buffers stdout/stderr lines that arrive before `attemptId` is assigned (process-beast-executor.ts:66-71), then flushes them after attempt creation (lines 160-173). This prevents a real race condition the spec didn't account for. |
| 2.C | Terminal state guard not in spec | Info | `handleProcessExit` checks if run is already in a terminal state before overwriting (process-beast-executor.ts:242-258). Prevents late exit callbacks from corrupting completed/stopped runs. |

**No gaps. DISCREPANCIES.md 2.1 and 2.2 are accurate.**

---

## Chunk 03 — Real buildProcessSpec

**Verdict: COMPLETE. All definitions and routes verified.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 3.A | `resolveCliEntrypoint` uses package-root traversal | Info | Spec shows `__dirname`-relative. Code walks up to package root, checks `dist/cli/run.js` then falls back to `src/cli/run.ts` (resolve-cli-entrypoint.ts:15-22). More robust. |
| 3.B | All three definitions verified correct | — | `martin-loop`: `process.execPath` + `[entrypoint, 'run', '--provider', '--chunks']` + `FRANKENBEAST_SPAWNED=1` (martin-loop-definition.ts:39-47). `chunk-plan`: `['plan', '--design-doc', '--output-dir']` (chunk-plan-definition.ts:31-38). `design-interview`: `['interview', '--goal', '--output']` (design-interview-definition.ts:31-38). |
| 3.C | `shouldDispatchOnCreate` returns true for all three | — | agent-routes.ts:362 lists all three definition kinds. |
| 3.D | All definitions include `configSchema` with `.strict()` | — | Verified in all three definition files. Tests include configSchema validation blocks. |

**No gaps. 34 tests passing across 4 test files.**

---

## Chunk 04 — Config File Passthrough

**Verdict: PARTIAL. Transport works. Several schema/consumption discrepancies.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 4.A | `loadRunConfig`/`loadRunConfigFromEnv` are sync, not async | Low | Spec defines them as `async` returning `Promise`. Code uses `readFileSync` and returns directly (run-config-loader.ts:57-73). Functionally fine for startup path. |
| 4.B | `LlmOverrideSchema` fields are optional, spec says required | Medium | Spec: `provider: z.string()`, `model: z.string()` (both required). Code: both `.optional()` (run-config-loader.ts:4-7). Allows partial overrides but contradicts spec. |
| 4.C | `GitConfigSchema` uses enums, spec uses boolean/string | Medium | Spec: `prCreation: z.boolean()`, `mergeStrategy: z.string()`. Code: `prCreation: z.enum(['auto','manual','disabled'])`, `mergeStrategy: z.enum(['merge','squash','rebase'])` (run-config-loader.ts:24-30). Code is stricter and better, but differs from spec. |
| 4.D | `RunConfigSchema` uses `.passthrough()`, not `.strict()` | Low | Spec implies strict validation. Code uses `.passthrough()` for forward compatibility (run-config-loader.ts:49). Test at run-config-loader.test.ts:90-102 explicitly tests unknown fields pass through. |
| 4.E | 6 config fields parsed but not consumed downstream | High | dep-factory.ts:186-206 only wires: `llmConfig.default.provider`, `llmConfig.default.model`, `gitConfig.baseBranch`, `maxTotalTokens`, `modules`. **NOT wired:** `objective`, `chunkDirectory`, `maxDurationMs`, `skills`, `promptConfig`, `llmConfig.overrides`, `gitConfig.branchPattern`, `gitConfig.prCreation`, `gitConfig.mergeStrategy`. The spec promise "these settings should be actually used" is unfulfilled. |
| 4.F | `loadRunConfigFromEnv` DOES log "loaded config from \<path\>" | — | Confirmed at run-config-loader.ts:71. DISCREPANCIES-PASS5 T.7 claiming this is unimplemented is **FALSE**. |

**DISCREPANCIES.md 4.10 [remaining] is accurate. Items 4.1-4.9 [fixed]/[ok] are accurate.**

---

## Chunk 05 — Error Reporting to Dashboard

**Verdict: COMPLETE. All event flows verified.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 5.A | Non-zero exit fires `attempt.failed` with correct payload | — | Verified: `{ exitCode, signal, lastStderrLines, summary }` (process-beast-executor.ts:278-288). |
| 5.B | Zero exit fires `attempt.finished` | — | Verified: `{ exitCode: 0 }` only, no `durationMs` in payload (process-beast-executor.ts:278-288). **Note:** Spec says payload should include `durationMs` — code does NOT include it in the event payload, though `finishedAt` is set on the attempt record. |
| 5.C | Spawn failure fires `run.spawn_failed` with `{ error, command, args }` | — | Verified (process-beast-executor.ts:118-128). Code adds extra `code` field (e.g., `'ENOENT'`). |
| 5.D | SIGTERM→SIGKILL escalation works | — | Verified with configurable timeout (process-beast-executor.ts:193-225). Timer cleared if process exits first (line 210). |
| 5.E | `syncTrackedAgent` idempotency guard is PARTIAL, not full | Medium | DISCREPANCIES.md 5.3 says "full idempotency guard: `trackedAgent.status === status` early-return before all writes — prevents duplicate updateTrackedAgent, SSE publishes, and event appends." **Actual code** (beast-run-service.ts:157-163): the guard at line 158 returns early, but `updateTrackedAgent` at line 163 runs AFTER the guard. So the guard does prevent SSE and event duplication, but NOT the DB write. The word "full" is overstated. |
| 5.F | `attempt.finished` payload missing `durationMs` | Low | Spec says zero-exit payload is `{ exitCode: 0, durationMs }`. Code only includes `exitCode` (and conditionally `lastStderrLines`/`summary` for failures). No `durationMs` in any event payload. |

---

## Chunk 06 — SSE Event Bus + Connection Tickets

**Verdict: COMPLETE with minor gaps.**

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| 6.A | Three spec'd event types NOT implemented | Medium | Spec lists 6 SSE event types. Only 3 are published: `agent.status`, `run.status`, `run.log`. **Missing:** `snapshot` (initial state on connect), `agent.event` (agent-level events), `run.event` (run-level events). Agent/run events go to DB only. |
| 6.B | Ticket store stores `token` field but never validates it | Low | `SseConnectionTicketStore.issue(token)` stores `{ token, expiresAt }` (sse-connection-ticket.ts:27). `validate(ticket)` only checks existence and expiry (lines 33-42) — does NOT verify the stored `token` matches the operator. ADR-030 implies token-binding; implementation only does ticket-existence validation. |
| 6.C | No live SSE delivery integration test | Low | sse-stream.test.ts only tests ticket issuance and auth rejection. No test for: event published → arrives in SSE stream, or `Last-Event-ID` replay. Confirmed remaining (DISCREPANCIES.md 6.5). |
| 6.D | `BeastDispatchService` DOES publish `agent.status` events | — | beast-dispatch-service.ts:112-115 and 139-142. **DISCREPANCIES-PASS4 F.2 claiming this is missing is STALE/FALSE.** |

---

## Cross-Cutting Findings

### False Claims in Prior Discrepancy Docs

| Doc | Claim | Truth |
|-----|-------|-------|
| DISCREPANCIES-PASS5 T.7 | "ADR-029 startup log promise is unimplemented" | **FALSE.** `loadRunConfigFromEnv()` logs `"loaded config from <path>"` at run-config-loader.ts:71. Test verified at run-config-loader.test.ts:150. |
| DISCREPANCIES-PASS4 F.2 | "`BeastDispatchService` publishes no SSE events" | **FALSE (STALE).** beast-dispatch-service.ts:112-115 publishes `agent.status` on successful start. Lines 139-142 publish on failure. |
| DISCREPANCIES.md 5.3 | "full idempotency guard prevents duplicate updateTrackedAgent" | **OVERSTATED.** Guard prevents SSE + event duplication, but `updateTrackedAgent` DB write is unconditional (beast-run-service.ts:163 runs before the guard at :158). |

### ADR Compliance

| ADR | Structural Promises | Behavioral Promises | Gap |
|-----|--------------------|--------------------|-----|
| ADR-029 | All met (file write, env var, cleanup, loader) | "loaded config" log: MET. Config fields consumed: PARTIAL (5/11 fields wired) | Unused fields (4.E above) |
| ADR-030 | All met (ticket store, TTL, single-use, timingSafeEqual) | Token-binding: structure exists but `validate()` doesn't check the `token` field | Low — single-operator system |

### Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| ProcessSupervisor | 12 tests | PASS |
| ProcessBeastExecutor | ~25 tests | PASS |
| Beast definitions | 34 tests (4 files) | PASS |
| Config passthrough | 5 tests | PASS |
| RunConfigLoader | 8 tests | PASS |
| Error reporting | 7 unit + 1 integration | PASS |
| Event bus | Unit tests | PASS |
| Ticket store | Unit tests | PASS |
| SSE routes | 3 integration (auth only) | PASS |
| **Total chunk-related** | ~95+ tests | **ALL PASS** |

---

## Summary: What's Actually Remaining

| # | Issue | Severity | Chunk |
|---|-------|----------|-------|
| **R1** | 6+ config fields parsed but not consumed downstream | High | 04 |
| **R2** | 3 SSE event types not implemented (`snapshot`, `agent.event`, `run.event`) | Medium | 06 |
| **R3** | `syncTrackedAgent` idempotency is partial (DB write unconditional) | Medium | 05 |
| **R4** | `attempt.finished` payload missing `durationMs` per spec | Low | 05 |
| **R5** | Ticket store `token` field stored but not validated against operator | Low | 06 |
| **R6** | No live SSE delivery or `Last-Event-ID` replay integration test | Low | 06 |
| **R7** | `LlmOverrideSchema` fields optional vs spec-required | Low | 04 |
| **R8** | `RunConfigSchema` uses `.passthrough()` vs spec's implied `.strict()` | Low | 04 |

### Items Previously Marked Remaining That Are Accurate
- DISCREPANCIES.md 4.10 [remaining] — confirmed (= R1 above)
- DISCREPANCIES.md 6.5 [remaining] — confirmed (= R6 above)

### Items Previously Marked Fixed That Are Overstated
- DISCREPANCIES.md 5.3 [fixed] — "full" idempotency is partial (= R3 above)

### Items in Prior Passes That Are Now False
- DISCREPANCIES-PASS5 T.7 — logging IS implemented
- DISCREPANCIES-PASS4 F.2 — dispatch service DOES publish SSE events
