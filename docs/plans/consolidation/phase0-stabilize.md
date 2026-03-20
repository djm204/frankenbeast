# Phase 0: Stabilize Current Branch

**Goal:** Merge the `feat/plan1-execution-pipeline` branch cleanly before starting any consolidation work. The consolidation must start from a green, tagged `main`.

**Dependencies:** None — this is the first phase.

**Why this matters:** The consolidation will delete 5 packages and rewrite a 6th. If `main` has failing tests or unmerged work, the consolidation branch becomes impossible to reason about. A clean baseline with an escape-hatch tag is non-negotiable.

---

## Current State

Branch `feat/plan1-execution-pipeline` (PR #241) has two remaining issues:

1. **`agent-failure-flow.test.ts` is still red** (DISCREPANCIES 5.5) — `lastStderrLines` is not populated in the `attempt.failed` event payload. The stderr data exists in persisted logs but doesn't make it into the SSE event.
2. **No end-to-end SSE test** (DISCREPANCIES 6.19) — route-level SSE behavior is proven in isolation, but no test goes through `chat-app.ts` → `startChatServer()` with real beast services.

Issue 1 is a blocker (test is red). Issue 2 is low severity and can be deferred.

## Success Criteria

- All Plan 1 tests pass (zero red tests in the targeted suite)
- PR #241 merged to `main`
- `main` passes `npm test && npm run build && npm run typecheck`
- `v0.pre-consolidation` tag exists on the merge commit
- No untracked files that should be gitignored

## Chunks

| # | Chunk | Committable Unit |
|---|-------|-----------------|
| 01 | [Fix Plan 1 remaining issues](phase0-stabilize/01_fix-plan1-remaining.md) | Fix `agent-failure-flow.test.ts`, merge PR #241 |
| 02 | [Tag pre-consolidation state](phase0-stabilize/02_tag-pre-consolidation.md) | Create `v0.pre-consolidation` tag |

## Risks

| Risk | Mitigation |
|------|-----------|
| `agent-failure-flow.test.ts` fix is non-trivial | The issue is well-understood: stderr buffer not flowing into event payload. Trace the data path from `ProcessBeastExecutor.finishAttempt()` to the SSE event. |
| PR #241 has merge conflicts with `main` | Current `main` hasn't diverged significantly. Resolve before starting Phase 1. |
