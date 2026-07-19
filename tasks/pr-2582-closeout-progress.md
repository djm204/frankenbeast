# PR #2582 closeout progress

- [x] Load Kanban task context and relevant closeout guidance.
- [x] Inspect live GitHub PR state, CI, current head, Codex poll, and unresolved threads.
- [x] Align isolated worktree with PR head.
- [x] Merge/update from `origin/main` to clear DIRTY merge state and resolve conflicts.
- [x] Inspect and fix current-head Codex findings in `packages/franken-orchestrator/src/cli/run.ts`.
- [x] Run targeted tests/typecheck/build as feasible.
- [ ] Push non-force closeout commit to PR branch.
- [ ] Reply/resolve Codex threads and trigger/poll fresh `@codex review` until clean or block with exact evidence.
- [ ] Merge or block with final live GitHub evidence.

## Verification

- `npm run test --workspace @franken/orchestrator -- tests/unit/cli/network-run.test.ts tests/unit/network/network-supervisor-runtime.test.ts tests/unit/http/service-health.test.ts` — passed (49 tests).
- `npm run build --workspace @franken/types && npm run build --workspace @franken/brain && npm run build --workspace @franken/observer && npm run typecheck --workspace @franken/orchestrator` — passed.
- `npm run build --workspace @franken/orchestrator` — passed.
- `npm run lint --workspace @franken/orchestrator -- src/network/network-supervisor-runtime.ts src/cli/run.ts tests/unit/cli/network-run.test.ts tests/unit/network/network-supervisor-runtime.test.ts` — passed with pre-existing warnings outside this change.
