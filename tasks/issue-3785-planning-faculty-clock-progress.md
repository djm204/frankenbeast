# Issue 3785 Planning Faculty Clock Progress

- [x] Revalidate live issue, labels, adjacent #3784 scope, competing PR/branch ownership, worktree branch, and exact origin/main base.
- [x] Read repository lessons and trace PlanningFacultyAdapter plus createBeastDeps clock wiring.
- [x] Reproduce lifecycle and lesson-consultation wall-clock drift with a frozen injected clock on current main (expected `2026-07-30T12:34:56.789Z`; observed four wall-clock values around `2026-07-30T14:21:23Z`).
- [x] Add a focused failing regression test for injected planning timestamps.
- [x] Inject the established clock through PlanningFacultyAdapter and createBeastDeps without changing existing constructor call sites.
- [x] Run focused adapter/dependency-factory tests, lint, typecheck, build, and relevant repository gates (root tests exposed unrelated pre-existing Codex runtime timing/unhandled-rejection failures; focused changed-path tests pass).
- [x] Self-review the diff and append only reusable lessons.
- [ ] Commit, push, open one PR closing #3785, and drive CI plus exact-head Codex review to clean.
- [ ] Squash-merge only if routine exact-head gates pass; verify issue closure and complete the Kanban handoff.
