# PR #2560 closeout progress

- [x] Loaded Kanban task context and closeout requirements.
- [x] Confirmed live PR #2560 is open, CI green, current head `5606135247640fcf683cd4b3fa20082374010614`, Codex reported current-head findings.
- [x] Aligned local isolated worktree with PR #2560 head and resolved the local conflict in `issue-runner.ts`.
- [x] Inspected the restart contract implementation and tests.
- [x] Fixed actionable current-head Codex findings in the restart-contract logic/tests, including the second Codex round on crash-like statuses, SIGTERM stops, and `spawn_failure` setup failures.
- [x] Ran targeted unit tests; workspace typecheck remains blocked by pre-existing `@franken/types`/zod/API drift unrelated to this diff.
- [ ] Commit and push fixes through approval discipline.
- [ ] Reply/resolve Codex threads and run a fresh Codex review loop.
- [ ] Merge or block with exact remaining gate evidence.
