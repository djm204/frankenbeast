# Issue #3306 progress

- [x] Refresh live issue and verify no existing PR/closing reference.
- [x] Read shared issue-resolution lessons and repository lessons.
- [x] Create isolated branch/worktree from `origin/main`.
- [x] Trace planner, cache, adapter, CLI session, timeout, and subprocess behavior.
- [x] Add failing tests for adaptive 1/2/4-pass planning, prompt-context reduction, metrics, draft recovery, and subprocess cancellation.
- [x] Implement a 120-second configurable planning deadline with cancellation propagation through cache/adapter layers.
- [x] Preserve the completed decomposition as a warning-marked draft when a later quality pass exceeds the budget.
- [x] Emit pass count, prompt bytes, total elapsed time, and per-stage timing/status metrics.
- [x] Verify 112 focused timeout/cancellation/cache/planning tests, package build/typecheck/lint, and the full orchestrator suite (4,038/4,039 passed; the unrelated provider-snapshot failure passed on isolated rerun).
- [x] Complete an independent Codex pre-commit review, address four timeout/cancellation findings, and obtain a clean final review.
- [ ] Open one PR with `Closes #3306`.
- [ ] Drive GitHub Codex review and CI to clean, merge, verify issue closure, and record a reusable lesson.
