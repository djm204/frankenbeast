# Plan 1 — Skeptical Recheck

> Created 2026-03-17 after a second adversarial pass over the live branch.
> Purpose: separate issues that were truly fixed from claims that merely swung too far in the optimistic direction.

---

## What Changed Since the Earlier Audits

Several earlier gaps are genuinely fixed now:

- `loadRunConfigFromEnv()` logs the config path on successful load.
- `SseConnectionTicketStore` stores `{ token, expiresAt }` and validates the operator token.
- `BeastDispatchService.createRun(startNow=true)` now publishes `agent.status` SSE events on both success and failure.
- Early buffered stdout/stderr are now flushed to both the log store and SSE.
- Route-level SSE integration tests now cover live delivery, replay, snapshot behavior, and event IDs.
- `syncTrackedAgent` now has a real pre-write idempotency guard.

Those should no longer be described as open gaps.

---

## What Still Does Not Survive Scrutiny

### 1. Chunk 04 is still overstated

The main discrepancy doc currently says all config fields are parsed and wired downstream. That is still not true.

Verified consumed:

- `modules`
- `llmConfig.default.provider`
- `llmConfig.default.model`
- `gitConfig.baseBranch`
- `gitConfig.branchPattern`
- `gitConfig.prCreation`
- `skills` as a filter
- `maxTotalTokens`

Still not verified as functionally used in the spawned-process path:

- top-level `provider`
- top-level `model`
- `maxDurationMs`
- `llmConfig.overrides`
- `gitConfig.mergeStrategy`
- `promptConfig`

The code packages some of these into `runConfigOverrides`, but that object is not read anywhere in `beast-loop.ts`, `phases/`, or `issues/`.

### 2. Chunk 05 is still overstated

The main discrepancy doc says all integration tests are passing. That is false.

Fresh targeted verification still fails:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/run-config-loader.test.ts tests/unit/beasts/execution/config-passthrough.test.ts tests/unit/beasts/process-beast-executor.test.ts tests/unit/beasts/events/sse-connection-ticket.test.ts tests/integration/beasts/sse-stream.test.ts tests/integration/beasts/agent-failure-flow.test.ts
```

Observed result:

- 52 tests run
- 51 passed
- 1 failed
- failing test: `tests/integration/beasts/agent-failure-flow.test.ts`

The specific mismatch is important:

- persisted logs contain the crashing stderr line
- `attempt.failed.payload.lastStderrLines` does not

That means the error-reporting path is still internally inconsistent.

### 3. Chunk 06 is mostly real, but not fully proven end to end

Earlier audits understated Chunk 06. The route behavior is now well tested.

The remaining skeptical point is narrower:

- there is still no end-to-end test through `chat-app.ts` / `startChatServer()` with real beast services proving the live dashboard path emits the expected SSE stream

That is a low-severity proof gap, not evidence that the route is broken.

---

## Current High-Signal Findings

| ID | Severity | Finding |
|----|----------|---------|
| S.1 | High | `DISCREPANCIES.md` still overclaims Chunk 04 completion; several parsed config fields are not functionally consumed |
| S.2 | High | `DISCREPANCIES.md` falsely says all Chunk 05 integration tests are passing |
| S.3 | Medium | `agent-failure-flow.test.ts` shows a real mismatch between persisted stderr logs and `lastStderrLines` in the failure event payload |
| S.4 | Low | Chunk 06 still lacks a full live-server end-to-end SSE test even though the route-level path is well covered |

---

## Net Verdict

The branch is in a better state than the early audits suggested.

But the docs have now overcorrected: they are claiming completion where the code still does not justify it. The honest current statement is:

- Chunk 04 is partial
- Chunk 05 is not complete
- Chunk 06 is mostly complete
