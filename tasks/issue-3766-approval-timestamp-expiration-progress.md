# Issue #3766 approval timestamp expiration progress

- [x] Read live issue #3766, overlapping #3736/#3751, PM handoffs, and shared lessons.
- [x] Confirm no existing open PR owns #3766 and issue is not labeled `good first issue`.
- [x] Rebase task branch onto current `origin/main` and configure required Git identity.
- [x] Reproduce or directly validate the reported stale approval-request acceptance on current `origin/main`.
- [x] Trace timestamp/config/registry data flow and define narrow duplicate-safe scope.
- [x] Add and run focused failing regression tests (RED).
- [x] Implement the minimal root-cause fix and pass focused tests (GREEN).
- [x] Run relevant governor tests, typecheck, lint, root checks/build, and inspect final diff. (Governor: 339 tests, typecheck/build/lint pass; root test/typecheck/build reached unrelated current-main orchestrator failures documented in the PR.)
- [x] Commit conventionally, push, and open one PR linked to #3766 (PR #3895).
- [ ] Obtain current-head GitHub Codex clean result, zero unresolved Codex threads, and green exact-head CI.
- [ ] Squash merge safely and verify issue closure plus current-main integration.
- [ ] Append reusable lesson(s), publish Kanban/root handoff, and complete the card.
