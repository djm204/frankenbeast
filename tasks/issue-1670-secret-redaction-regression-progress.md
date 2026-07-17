# Issue 1670 Secret Redaction Regression Progress

- [x] Read shared lessons and live issue state.
- [x] Create isolated worktree on `resolve/issue-1670-security-add-secret-redaction-regression-suite-f`.
- [x] Add fixture-driven tests for log, memory, trace, and error-response redaction surfaces.
- [x] Implement minimal redaction gaps exposed by the tests.
- [x] Document safe addition of future secret patterns.
- [x] Run targeted package tests/checks.
- [ ] Commit, push, open PR, run Codex gate, merge.

Verification completed:
- `npx vitest run tests/security-secret-redaction-regression.test.ts`
- `npm run test --workspace @franken/orchestrator -- tests/unit/logger.test.ts`
- `npm run test --workspace @franken/mcp-suite -- src/servers/memory.test.ts`
- `npm run test --workspace @franken/observer -- src/adapters/sqlite/SQLiteAdapter.test.ts`
- `npm run typecheck --workspace @franken/orchestrator`
- `npm run typecheck --workspace @franken/mcp-suite`
- `npm run typecheck --workspace @franken/observer`
- `npm run build`
- `npm run lint --workspace @franken/orchestrator` (0 errors, pre-existing warnings)
- `npm run lint --workspace @franken/mcp-suite` (0 errors, pre-existing warnings)
- `npm run lint --workspace @franken/observer` (0 errors, pre-existing warnings)
