# Issue 1854 failed-test-to-skill candidate detector progress

- [x] Inspect issue #1854 and repository instructions.
- [x] Locate current lesson capture implementation and tests.
- [x] Add the smallest failed-test-to-skill candidate detector behavior.
- [x] Cover success and edge cases with targeted tests.
- [x] Update operator-facing docs/help guidance.
- [x] Run targeted verification.
  - Initial `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` failed because dependencies were absent (`Cannot find package 'vitest'`).
  - `npm ci --ignore-scripts --no-audit --no-fund` failed because `package.json` and `package-lock.json` are not in sync for esbuild optional packages.
  - Installed repo dependencies with `npm install --ignore-scripts --no-audit --no-fund --package-lock=false` after disk preflight.
  - `npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts` passed (16 tests).
  - Initial typecheck failed until `@franken/types` was built.
  - `npm run build --workspace @franken/types && npm run typecheck --workspace @franken/critique` passed.
- [ ] Commit, push, open PR, and request Codex review.
