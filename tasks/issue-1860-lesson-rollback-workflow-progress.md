# Issue 1860 lesson rollback workflow progress

- [x] Inspect issue #1860 and repository instructions.
- [x] Locate current lesson capture and traceability implementation.
- [x] Add the smallest structured lesson rollback workflow.
- [x] Add focused success and edge-case tests.
- [x] Update operator-facing docs/help text.
- [x] Run targeted verification.
  - `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` passed (13 tests).
  - `npm run build --workspace @franken/types && npm run typecheck --workspace @franken/critique` passed.
- [ ] Commit, push, open PR, and request Codex review.
