# Chunk 08: Full Regression Test + Gitlink Update

## Objective

Run full typecheck, test suite, and build across the orchestrator and root repo. Fix any regressions. Update the orchestrator gitlink in the root frankenbeast repo.

Covers original plan Tasks 19 and 20.

## Files

- **Verify**: `franken-orchestrator/` (typecheck + all tests)
- **Verify**: Root repo (integration tests + build)
- **Modify**: Root `franken-orchestrator` gitlink (update submodule pointer)

## Success Criteria

- [ ] `cd franken-orchestrator && npx tsc --noEmit` — no errors
- [ ] `cd franken-orchestrator && npm test` — all orchestrator tests pass
- [ ] Root integration tests pass: `npx vitest run` (root repo)
- [ ] Any regressions identified and fixed with atomic commits
- [ ] Orchestrator changes pushed to remote
- [ ] Root repo gitlink updated: `git add franken-orchestrator && git commit`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npm test && cd .. && npx vitest run
```

## Hardening Requirements

- If any test fails, diagnose and fix the root cause — do NOT skip tests
- If typecheck fails, trace the type error to its source — likely a missed `string` widening somewhere
- Do NOT run `npm run build` or `npm run test:all` at root — other submodules are gitlink-only (no content) and will fail. Scope verification to orchestrator + root vitest only.
- Push orchestrator changes BEFORE updating the gitlink
- Git remote format: `git@github.com-djm204:djm204/franken-orchestrator.git`
- Commit message for gitlink: `chore: update orchestrator gitlink — pluggable CLI providers`
- Do NOT force-push or amend — create new commits only
