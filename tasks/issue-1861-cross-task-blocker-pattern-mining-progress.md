# Issue 1861 — cross-task blocker pattern mining progress

- [x] Read issue #1861 and repo instructions.
- [x] Inspect current learning/lesson capture surfaces.
- [x] Add narrow cross-task blocker pattern mining implementation.
- [x] Add deterministic positive and edge-case tests.
- [x] Add operator-facing guidance for interpreting structured output.
- [x] Run targeted verification.
- [ ] Commit, push, open PR, and request Codex review.

Verification notes:
- `npm run test --workspace @franken/critique -- tests/unit/memory/blocker-pattern-miner.test.ts` passed (4 tests).
- `npx tsc -p .tmp/issue-1861-tsconfig.json --noEmit` passed for the new miner with a local ignored `@franken/types` stub.
- Package typecheck remains blocked by existing workspace package resolution: `npm run typecheck --workspace @franken/critique` cannot resolve `@franken/types` in this isolated install.
