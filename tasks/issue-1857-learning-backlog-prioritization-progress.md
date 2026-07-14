# Issue 1857 learning backlog prioritization report progress

- [x] Inspect issue #1857, shared lessons, and current learning/lesson recorder code.
- [x] Create isolated branch/worktree for issue #1857.
- [x] Add targeted failing tests for the learning backlog prioritization report.
- [x] Implement the smallest structured report behavior.
- [x] Update operator-facing docs.
- [x] Run targeted verification plus relevant typecheck/build/lint.
  - `npm run build --workspace @franken/types` passed.
  - `npm run typecheck --workspace @franken/critique` passed.
  - `npm run lint --workspace @franken/critique` passed.
  - `npm run build --workspace @franken/critique` passed.
  - `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` passed (46 tests).
- [ ] Commit, push, open PR, and complete Codex/CI gate or block with exact status.
