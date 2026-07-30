# Issue 3847 progress

- [x] Revalidate Kanban ownership, clean issue branch, exact `origin/main`, issue state, competing PRs, and remote branches.
- [x] Read shared and repository lessons.
- [x] Trace `BrainAdapter.store`, its callers, `Brain.flush`, and working-memory rollback/persistence semantics.
- [x] Add a focused regression test for `flush()` failure and confirm the exact symptom is RED.
- [x] Implement the narrowest coherent fix while preserving the original error/cause.
- [x] Confirm focused GREEN and post-failure in-memory state.
- [x] Run relevant mcp-suite tests, lint, typecheck, build, and secret scan.
- [x] Self-review the diff and verify no unrelated changes.
- [x] Commit with configured identity and a Conventional Commit message.
- [x] Push, open one PR closing #3847, and verify local/remote/PR head equality.
- [ ] Run current-head GitHub Codex review, resolve all findings, verify zero unresolved threads and green CI.
- [ ] Squash merge only after all authorized gates; verify issue closure.
- [ ] Append concise reusable lessons and complete the Kanban handoff.
