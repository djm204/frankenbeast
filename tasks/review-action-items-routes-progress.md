# Review Action Items Routes Progress

Worktree: `.worktrees/review-action-items-routes`
Branch: `codex/review-action-items-routes`
Base: `codex/review-action-items-p0`
Issues: #329, #332

## Checklist

- [x] Inspect `packages/franken-orchestrator/tests/integration/beasts/agent-routes.test.ts` and related route helpers.
- [x] Clarify integration-test scope or isolate circular dependencies where appropriate.
  - Kept the suite under `tests/integration`, renamed the suite to `agent routes integration`, and renamed the broad dependency helper to `createIntegratedBeastApp` with an explicit integration-scope comment.
- [x] Make event assertions semantic rather than brittle/order-sensitive.
  - Added `expectEventsToIncludeTypes` and replaced direct event-type array assertions in the agent route integration suite.
- [x] Run targeted tests for changed files.
  - `npm --workspace packages/franken-orchestrator exec vitest run tests/integration/beasts/agent-routes.test.ts` passed: 15 tests, 1 file.
- [x] Run package typecheck if feasible.
  - `npm --workspace packages/franken-orchestrator run typecheck` passed.
- [x] Run Codex review loop and fix findings.
  - `codex exec review --dangerously-bypass-approvals-and-sandbox --commit HEAD` passed with no actionable findings.
- [x] Commit changes referencing #329 and #332.

## Disk constraints

- Do not install dependencies unless required.
- Do not create additional worktrees.
- No dependency install performed.
- No additional worktrees created.
