# Issue #3864 Managed-Service PATH Progress

- [x] Create a clean isolated worktree on current `origin/main` (`715da9d456d9a883aa96d85f53cbefca832da1c1`).
- [x] Confirm no existing remote branch or pull request owns `fix/issue-3864-managed-service-path`.
- [x] Trace managed-service environment construction and executable availability checks.
- [x] Reproduce the managed-service false-unavailable state before production edits.
- [x] Add a failing regression for conventional trusted operator CLI paths.
- [x] Add/confirm regression coverage proving arbitrary inherited `PATH` entries remain excluded.
- [x] Implement the minimal trusted-path change.
- [x] Run focused orchestrator tests.
- [x] Run package/root typecheck, lint, test, and build gates required by the issue (tests pass in an isolated network namespace; host default ports are owned by unrelated managed services).
- [x] Verify the actual managed-service dependency snapshot without exposing credentials.
- [x] Record reusable findings in `tasks/resolve-issues-shared-lessons.md`.
- [x] Inspect the staged diff and commit with the configured David Mendez identity.
- [x] Push one issue branch and open one linked pull request (#3868).
- [ ] Run the bounded exact-current-head GitHub Codex review/remediation loop.
- [ ] Verify green CI and zero unresolved review threads.
- [ ] Leave an immutable merge-ready Kanban handoff without merging.
