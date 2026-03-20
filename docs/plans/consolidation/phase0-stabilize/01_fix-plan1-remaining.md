# Chunk 0.1: Fix Plan 1 Remaining Issues

**Phase:** 0 — Stabilize Current Branch
**Depends on:** Nothing
**Estimated size:** Small (1-2 files changed)

---

## Problem

`agent-failure-flow.test.ts` asserts that `attempt.failed` event payload contains `lastStderrLines` with the crashing process's stderr output. The test is red because:

1. `ProcessBeastExecutor` buffers stderr lines in `stderrRingBuffer` during process execution
2. When the process exits with a non-zero code, `finishAttempt()` constructs the `attempt.failed` event
3. The `lastStderrLines` field in the event payload is empty — the ring buffer contents are not copied into the event payload

The stderr data IS persisted in the log store (verified in DISCREPANCIES-PASS5), so the data exists — it's just not making it into the structured event.

## What to Do

### 1. Trace the data path

In `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts`:

- Locate `finishAttempt()` method
- Find where `attempt.failed` payload is constructed
- The payload likely has `{ exitCode, error, durationMs }` but is missing `lastStderrLines`
- The `stderrRingBuffer` (or equivalent) should be accessible at this point — it's populated by the stderr stream handler earlier in the same class

### 2. Fix the payload construction

Add `lastStderrLines: this.stderrRingBuffer.getLines()` (or equivalent) to the `attempt.failed` event payload. The ring buffer should contain the last N lines of stderr (typically 20-50 lines).

### 3. Verify the test passes

Run the specific test:
```bash
npx turbo run test --filter=franken-orchestrator -- --grep "agent-failure-flow"
```

Then run the full suite:
```bash
npm test
```

### 4. Address DISCREPANCIES 6.19 (optional)

If time permits, add a lightweight e2e SSE test through `startChatServer()`. This is low severity and can be deferred to a future PR if it would delay the merge.

## Files

- **Modify:** `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts` — add `lastStderrLines` to `attempt.failed` payload
- **Verify:** `packages/franken-orchestrator/tests/integration/beasts/agent-failure-flow.test.ts` — should go green

## Exit Criteria

- `agent-failure-flow.test.ts` passes
- `attempt.failed` event payload includes `lastStderrLines` with actual stderr content
- Full test suite passes: `npm test && npm run build && npm run typecheck`
- PR #241 is mergeable (no conflicts, CI green)
- PR #241 merged to `main`
