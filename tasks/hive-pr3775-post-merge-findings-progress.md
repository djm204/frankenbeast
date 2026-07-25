# Hive PR #3775 post-merge findings progress

- [x] Verify Kanban assignment, clean isolated worktree, exact detached `origin/main` head, GitHub auth, and Git identity.
- [x] Create the singular follow-up branch from verified `origin/main`.
- [x] Fetch and classify all seven unresolved Codex findings from merged PR #3775.
- [x] Trace affected definitions, usages, and existing tests.
- [x] Reproduce each valid contract-critical finding with a failing focused test.
- [x] Implement minimal fixes and keep focused tests green.
- [x] Run package tests, typecheck, build, and lint. (`@franken/brain`: 489/489 tests, typecheck, lint, and build pass after the first follow-up Codex fixes; root lint previously passed. Root test has three unrelated orchestrator failures; root typecheck/build remain blocked by pre-existing `franken-web` errors.)
- [x] Commit with the required Git identity.
- [x] Route push and follow-up PR creation through the dedicated Hive Approval Cop. (PR #3788 created at immutable head `20d0e9c7a2a72c6984c745879861b1419e23d44e`.)
- [x] Run at most two batched Codex review rounds. (Round 2/2 identified five current-head findings: `3651129009`, `3651129011`, `3651129012`, `3651129013`, `3651129015`; no third invocation is permitted.)
- [x] Reproduce all five final-round findings with focused failing tests on `ec1367b5bf5aef079fb034bf9e521aa93ee95668`.
- [x] Implement one cap-compliant final batch: migrate path-derived publisher ownership, retry pending WAL purges on store activity/close, return cached brains before DB initialization, conservatively revoke legacy lessons without candidate IDs, and defer page reuse without per-deletion `VACUUM`.
- [x] Re-run focused and package gates. (`HiveMindStore`: 22/22; `@franken/brain`: 493/493 tests, lint, typecheck, and build.)
- [ ] Commit the final batch with required identity and route push plus five thread replies/resolutions through Approval Cop.
- [ ] Verify exact-head green CI, zero paginated unresolved Codex threads, and approval-routed merge/closeout.
- [ ] Record remediation evidence and terminalize replacement Kanban card `t_6bb27e14`.
