# Issue 1855 reviewer-feedback lesson capture progress

- [x] Inspect issue #1855 and repository instructions.
- [x] Locate current lesson recording implementation and tests.
- [x] Add structured reviewer-feedback capture to recorded critique lessons.
- [x] Cover success and edge cases with targeted tests.
- [x] Update operator-facing package docs.
- [x] Run targeted verification.
  - Initial `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` failed because dependencies were absent (`Cannot find package 'vitest'`).
  - Installed repo dependencies with `npm install --ignore-scripts --no-audit --no-fund --package-lock=false` after disk preflight.
  - `npm run build --workspace @franken/types && npm run typecheck --workspace @franken/critique && npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` passed.
- [ ] Commit, push, open PR, and request Codex review.
