# Issue 1677 Kanban Idempotency Progress

- [x] Read Kanban task, GitHub issue #1677, shared lessons, and repo lessons.
- [x] Confirm no existing open PR owns issue #1677 and create isolated worktree/branch.
- [x] Locate PM/liveness Kanban-adjacent state update helpers in `IssueRunner`.
- [x] Add deterministic idempotency/compare-and-set planning for comment/block/unblock/complete mutations.
- [x] Add regression tests for repeated comment/block/unblock/complete and stale concurrent revision conflicts.
- [x] Document how PM/doctor/watchdog callers should derive stable idempotency keys and handle `apply`/`skip`/`conflict`.
- [x] Run targeted tests and package checks after final export/docs changes.
- [ ] Commit, push, open PR closing only #1677.
- [ ] Run real GitHub `@codex review` loop until current-head clean, then merge if CI is green.
- [ ] Append reusable shared lessons if useful and complete/block the Kanban card.
