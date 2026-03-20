# Plan 1 — Truth Audit

> Created 2026-03-17.
> This is a focused current-state audit of the claims made in the Plan 1 discrepancy docs.
> Standard used here: do not trust docs, verify against source and tests.

---

## Scope

This audit re-checked:

- `DISCREPANCIES.md`
- `DISCREPANCIES-PASS2.md`
- `DISCREPANCIES-PASS3.md`
- `DISCREPANCIES-PASS4.md`
- ADR-029 and ADR-030
- The current code paths implementing Chunk 04, Chunk 05, and Chunk 06
- Targeted Plan 1 unit and integration tests

---

## Most Important False or Misleading Claims

### 1. "Plan 1 is complete" is not supportable

This is the biggest falsehood in the current doc set.

- `DISCREPANCIES.md` previously said Chunk 05 was complete and all issues were resolved.
- `DISCREPANCIES-PASS4.md` previously said `30/30 spec tasks implemented across all 6 chunks`.
- The current branch still fails `tests/integration/beasts/agent-failure-flow.test.ts`.

The failing assertion is the stderr-capture assertion for `lastStderrLines`, not an incidental doc mismatch. That means one of the branch's core error-reporting behaviors is not currently verified end to end.

### 2. "Config passthrough is fully wired" is overstated

Chunk 04 successfully serializes the config, validates it, and re-loads it in the spawned process. That part is real.

What is not real is the stronger claim from the spec and earlier discrepancy docs that modules, LLM overrides, git settings, skills, and prompts are all "actually used."

The current code functionally uses:

- `modules`
- `llmConfig.default.provider`
- `llmConfig.default.model`
- `gitConfig.baseBranch`
- `gitConfig.branchPattern`
- `gitConfig.prCreation`
- `maxTotalTokens`
- `skills` as an allowed-skill filter

The current code does not functionally consume:

- top-level `provider`
- top-level `model`
- `maxDurationMs`
- `llmConfig.overrides`
- `gitConfig.mergeStrategy`
- `promptConfig`
- `runConfigOverrides` downstream of `dep-factory.ts`

This is partial implementation, not full implementation.

### 3. The real remaining execution bug is the stderr-tail mismatch

The most important live bug after the newer fixes is not in SSE routing. It is the inconsistency between:

- what gets persisted in the log store
- what gets copied into `attempt.failed.payload.lastStderrLines`

The fresh failing integration test proves those two views of the same failure are diverging today.

### 4. Several earlier SSE and idempotency gaps are now actually fixed

The live branch now does these correctly:

- `BeastDispatchService.createRun(startNow=true)` publishes `agent.status` on success and failure
- early buffered stdout/stderr are published as `run.log` SSE events after attempt creation
- `syncTrackedAgent` has a pre-write idempotency guard

Those should no longer be called open issues.

### 5. The remaining SSE proof gap is higher-level, not route-level

The route itself is now integration-tested for live delivery, replay, snapshot-on-connect behavior, and monotonic IDs.

The missing proof is one layer up: there is still no end-to-end test through the live server wiring with real beast services producing those events on the common dashboard path.

---

## Verified Open Gaps

| ID | Severity | Gap |
|----|----------|-----|
| T.1 | High | `agent-failure-flow.test.ts` is failing, so Chunk 05 is not honestly complete |
| T.2 | High | Chunk 04 still has parsed-but-unused behavioral fields, including dead top-level `provider` / `model` and unread `runConfigOverrides` payloads |
| T.3 | Medium | `agent-failure-flow.test.ts` still fails because `lastStderrLines` drops the crashing stderr line even though the log store captures it |
| T.4 | Low | There is no end-to-end live-server SSE test through `chat-app.ts` / `startChatServer()` and real beast services |

---

## Evidence Checked

### Failing test

Command run:

```bash
npm --workspace franken-orchestrator test -- tests/integration/beasts/agent-failure-flow.test.ts
```

Observed result:

- 1 test run
- 1 test failed
- failure at the assertion checking that `attempt.failed.payload.lastStderrLines` contains `"boom"`

### Key code paths reviewed

- `packages/franken-orchestrator/src/cli/dep-factory.ts`
- `packages/franken-orchestrator/src/cli/run-config-loader.ts`
- `packages/franken-orchestrator/src/cli/session.ts`
- `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`
- `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts`
- `packages/franken-orchestrator/src/beasts/services/beast-run-service.ts`
- `packages/franken-orchestrator/src/beasts/events/sse-connection-ticket.ts`
- `packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts`
- `packages/franken-orchestrator/tests/integration/beasts/sse-stream.test.ts`

---

## Recommended Reading Order

1. `DISCREPANCIES.md` for the current branch status
2. This truth audit for the strongest verified falsehoods
3. `DISCREPANCIES-PASS4.md` for the adversarial reasoning behind the corrected claims

---

## Conclusion

The Plan 1 code is not fake. The repo has real implementation across all six chunks.

The doc problem is different: several documents quietly drifted from "the code exists" to "the feature is complete and fully truthful." That stronger claim does not survive verification.

The honest current statement is:

- Chunks 01 to 03 are effectively done.
- Chunk 04 is still only partially real.
- Chunk 05 is not complete while its failure-path integration test is red.
- Chunk 06 is substantially more real than earlier audits gave it credit for, but the server-integrated path still lacks end-to-end proof.
