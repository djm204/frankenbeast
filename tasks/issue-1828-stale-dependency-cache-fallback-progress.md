# Issue #1828 — Stale Dependency Cache Fallback Progress

- [x] Read issue and shared lessons.
- [x] Create isolated worktree and set git identity.
- [x] Add stale dependency output fallback implementation.
- [x] Add checkpoint-store and execution-phase regression tests.
- [x] Document resume behavior in beast loop docs.
- [x] Run targeted tests: `npm --prefix packages/franken-orchestrator test -- tests/unit/file-checkpoint-store.test.ts tests/unit/phases/execution.test.ts`.
- [x] Run package lint: `npm --prefix packages/franken-orchestrator run lint` (passes with existing warnings).
- [x] Build internal dependencies, then run package typecheck/build.
- [ ] Commit, push, open PR, and run Codex gate.
