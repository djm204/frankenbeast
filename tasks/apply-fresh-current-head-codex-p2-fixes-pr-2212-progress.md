# Apply fresh current-head Codex P2 fixes on PR #2212

- [x] Orient on Kanban task and PR branch/worktree.
- [x] Inspect sqlite-brain right-to-forget/encryption implementation and related tests.
- [x] Add regression coverage for the current-head Codex P2 findings.
- [x] Implement fixes in `packages/franken-brain/src/sqlite-brain.ts` and `packages/franken-mcp-suite/src/shared/server-factory.ts`.
- [x] Run targeted franken-brain/franken-mcp-suite verification.
  - [x] `npm run test --workspace @franken/brain -- tests/unit/sqlite-brain.test.ts` (141 passed).
  - [x] `npm run typecheck --workspace @franken/brain`.
  - [x] `npm run lint --workspace @franken/brain`.
  - [x] `npm run build --workspace @franken/brain`.
  - [x] `npm run test --workspace @franken/mcp-suite -- src/shared/server-factory.test.ts` (36 passed).
  - [x] `npm run typecheck --workspace @franken/mcp-suite`.
  - [x] `npm run lint --workspace @franken/mcp-suite` (0 errors, existing warnings only).
  - [x] `npm run build --workspace @franken/mcp-suite`.
- [ ] Push PR branch.
- [ ] Reply to and resolve Codex threads 3581527897, 3581527901, 3581527905, 3581527906.
- [ ] Trigger and poll a fresh current-head Codex review.
- [ ] Leave Kanban handoff and block/complete appropriately.
