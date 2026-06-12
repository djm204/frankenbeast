# Review Action Items Progress

Started: 2026-06-11
Final branch: `codex/review-action-items-all`

## Disk-aware operating rules

- [x] Ran disk preflight before creating any new worktree.
- [x] Did not delete pre-existing worktrees without explicit user approval.
- [x] Created one P0 worktree first, then limited later parallelism to two subagent lanes.
- [x] Re-checked disk usage before later lanes.
- [x] Avoided dependency installs; all work reused existing repo tooling/dependencies.
- [x] Used task-local worktrees under `.worktrees/review-action-items-*` for predictable cleanup.
- [ ] Remove task-created worktrees after PR is opened and branch is pushed.
- [ ] Run `git worktree prune` after cleanup.

## Preflight findings

- Root filesystem at start: 99G total, 71G used, 24G available, 75% used.
- Current project size at start: 4.4G.
- Existing `.worktrees` size at start: 3.4G.
- Existing `.claude` size at start: 467M.
- Existing `node_modules` size at start: 320M.
- Codex CLI available: `codex-cli 0.130.0`.
- GitHub CLI available and authenticated.
- Current checkout had pre-existing uncommitted task/progress files, so implementation used isolated worktrees from `origin/main`.

## Implementation order

1. P0 first:
   - [x] #325 Refactor `createCliDeps` into focused dependency factories.
   - [x] #326 Fail loudly for broken optional dynamic imports.
   - [x] Ran Codex implementation loop in isolated P0 worktree.
   - [x] Ran Codex review loop for P0 changes.
   - [x] Fixed Codex review finding around cleanup-on-error for post-observer optional module failures.
   - [x] Re-ran Codex review loop and targeted tests/typecheck.

2. Limited parallel lanes after P0 and disk recheck:
   - [x] #327, #328: typed CLI skill executor test fixtures and removed unsafe casts in touched tests.
   - [x] #329, #332: clarified agent routes as integration tests and replaced brittle event assertions with semantic helpers.
   - [x] Both parallel lanes ran targeted tests/typecheck and Codex review loops.

3. Remaining reliability lane:
   - [x] #330 Hardened temp directory cleanup in filesystem-backed tests.
   - [x] #331 Normalized fake timer cleanup in rate-limit resilience tests.
   - [x] #333 Added runtime timeout protection for regex safety evaluation.
   - [x] #334 Added deprecation/sunset guidance to backward-compat tests.
   - [x] Ran Codex review loop, fixed ESM worker body issue, fixed timeout severity/large-scan findings, and re-ran review until no findings.

## Final verification

- [x] `npm test --workspace franken-orchestrator -- --run tests/unit/cli/dep-factory-providers.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/unit/skills/cli-skill-executor.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/beasts/process-beast-executor.test.ts tests/unit/skills/rate-limit-resilience.test.ts` passed: 149 tests.
- [x] `npm test --workspace @franken/critique -- --run tests/unit/evaluators/safety.test.ts` passed: 25 tests.
- [x] `npm run typecheck --workspace franken-orchestrator` passed.
- [x] `npm run build --workspace @franken/critique` passed.
- [x] `git diff --check HEAD^..HEAD` passed.
- [x] Final integrated `codex exec review --dangerously-bypass-approvals-and-sandbox --base origin/main` reported no actionable regressions.

## Final acceptance

- [x] All issue fixes implemented.
- [x] Codex review loop triggered for every issue/group and final integrated branch.
- [x] Tests/typecheck/build run with real output.
- [ ] PR opened.
- [ ] Task-created worktrees cleaned up after PR creation.
- [ ] Final disk usage reported after cleanup.
