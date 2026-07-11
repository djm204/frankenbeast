# Issue 1864 lesson-to-test traceability progress

- [x] Inspect issue #1864 and repository instructions.
- [x] Locate current lesson capture/recording implementation and tests.
- [x] Add the smallest lesson-to-test traceability behavior.
- [x] Add focused success and edge-case tests.
- [x] Update operator-facing docs/help guidance.
- [x] Run targeted verification.
  - `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` passed (10 tests).
  - `npm run build --workspace @franken/types && npm run typecheck --workspace @franken/critique` passed after installing workspace dependencies because the isolated worktree had no node_modules.
- [ ] Commit, push, open PR, and request Codex review.
