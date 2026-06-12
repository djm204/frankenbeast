# Review Action Items P0 Progress

Worktree: `.worktrees/review-action-items-p0`
Branch: `codex/review-action-items-p0`
Issues: #325, #326

## Checklist

- [x] Inspect `packages/franken-orchestrator/src/cli/dep-factory.ts` and related tests.
- [x] Refactor `createCliDeps()` into smaller focused domain factories while preserving public behavior.
- [x] Keep `createCliDeps()` as a thin composition layer.
- [x] Update/add focused tests for extracted factories where practical.
- [x] Change optional dynamic import handling so true missing optional modules can stub, but broken installed modules fail loudly.
- [x] Add tests for missing optional module vs broken optional module behavior.
- [x] Run targeted tests for changed code.
- [x] Run typecheck/build if feasible in this worktree.
- [x] Commit changes on `codex/review-action-items-p0`.
- [x] Run Codex review loop after implementation.
- [x] Apply review fixes and re-run tests.
- [x] Fix Codex review finding: clean up observer resources when post-observer optional critique/governor setup fails.
- [x] Amend existing P0 commit after review fix.

## Disk constraints

- Avoid dependency installs unless required.
- If dependencies must be installed, keep it to this single P0 worktree and report disk usage afterward.
- Do not create additional worktrees during P0.

## Plan

- Add focused unit coverage in `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts` for optional import semantics. Missing optional modules should preserve the existing stub fallback; broken module initialization should reject with a diagnostic that names the failed module.
- Extract optional-module loading and domain-specific construction from `packages/franken-orchestrator/src/cli/dep-factory.ts`: effective config/module flags, reset/log/session paths, observer/checkpoint state, LLM/client stack, critique, governance, consolidated deps/skills, issues, and finalize handling.
- Keep public behavior stable: `createCliDeps(options)` continues to return the same shape, module-disable flags still use stubs, issue deps remain conditional on `issueIO`, replay/audit finalization remains best-effort, and no dependency installation/worktree creation is planned.
- Verify with targeted `vitest` for dep-factory tests, then run package typecheck if dependencies are already present.

## Notes

- fbeast MCP tools referenced by AGENTS.md are unavailable in this Codex toolset, so their memory/firewall/observer/critique calls cannot be executed directly.
- Red test pass/fail check: `rtk npm test -- --run tests/unit/cli/dep-factory-providers.test.ts` failed as expected on the two broken-module cases because current code resolves with stubs instead of rejecting; true-missing stub tests passed.
- Review-fix red check: `rtk npm test --workspace franken-orchestrator -- --run tests/unit/cli/dep-factory-providers.test.ts` failed as expected because verbose trace-viewer cleanup was not called when critique initialization rejected after observer setup.
- Review fix wraps post-observer `createCliDeps()` setup in cleanup-on-error. The cleanup reuses the current finalize chain so trace viewer handles, and any later governor readline wrapper, are stopped/closed before the original error is rethrown.

## Verification

- `rtk npm test -- --run tests/unit/cli/dep-factory-providers.test.ts` passed (20 tests).
- `rtk npm test -- --run tests/integration/cli/dep-factory-wiring.test.ts` passed (17 tests).
- `rtk npm run typecheck` passed.
- `rtk npm test --workspace franken-orchestrator -- --run tests/unit/cli/dep-factory-providers.test.ts` passed (22 tests).
- `rtk npm test --workspace franken-orchestrator -- --run tests/integration/cli/dep-factory-wiring.test.ts` passed (17 tests).
- `rtk npm run typecheck --workspace franken-orchestrator` passed.
- No dependency install was needed.

## Review

- Independent review subagent reported no findings.
- No review fixes were required after the final focused verification.
- Codex review finding addressed locally; no push performed.
