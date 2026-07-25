# Hive PR #3775 post-merge findings progress

- [x] Verify Kanban assignment, clean isolated worktree, exact detached `origin/main` head, GitHub auth, and Git identity.
- [x] Create the singular follow-up branch from verified `origin/main`.
- [x] Fetch and classify all seven unresolved Codex findings from merged PR #3775.
- [x] Trace affected definitions, usages, and existing tests.
- [x] Reproduce each valid contract-critical finding with a failing focused test.
- [x] Implement minimal fixes and keep focused tests green.
- [x] Run package tests, typecheck, build, and lint. (`@franken/brain`: 486/486 tests, build, and typecheck pass; root lint passes. Root test has three unrelated orchestrator failures; root typecheck/build remain blocked by pre-existing `franken-web` errors.)
- [x] Commit with the required Git identity.
- [ ] Route push and follow-up PR creation through the dedicated Hive Approval Cop.
- [ ] Run at most two batched Codex review rounds; resolve all original and follow-up threads through Approval Cop.
- [ ] Verify exact-head green CI, zero paginated unresolved Codex threads, and approval-routed merge/closeout.
- [ ] Record remediation evidence and terminalize Kanban card `t_fd5ece5d`.
