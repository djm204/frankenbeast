# Close out PR #2616 current-head Codex findings

- [x] Load Kanban task and PR context
- [x] Check out PR branch/head in isolated worktree
- [x] Inspect current issue-runner restart/diagnostic logic and Codex findings
- [x] Patch issue-runner restart contract findings
- [x] Add/update unit tests for the findings
- [x] Run targeted tests/typecheck
- [x] Push changes through the approved path or block with exact approval-cop handoff if gated. Pushed `de7234eac13b5ea9d3d992f9699d93cb0d4253c8` to `origin/resolve/issue-1675-late-codex-followup`.
- [x] Reply/resolve pre-existing Codex threads and trigger fresh current-head @codex review at `2026-07-18T02:11:54Z`.
- [x] Capture and fix the fresh current-head Codex findings (`3607351492`, `3607351498`) with regression tests.
- [ ] Push updated fix commit, reply/resolve the fresh Codex threads, and rerun current-head @codex review until clean.
- [ ] Verify CI, CLEAN mergeability, zero unresolved Codex threads, then merge or block with exact evidence.
