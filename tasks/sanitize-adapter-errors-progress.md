# Sanitize adapter errors progress

- [x] Revalidate issue #3662 is open, no duplicate open PR exists, and the isolated worktree is clean at the assigned base.
- [x] Trace `AdapterLlmError` construction and identify raw provider error interpolation as the leak source.
- [x] Add and run a failing regression test for secret redaction while preserving request context and `cause`.
- [x] Implement the minimal redaction fix and make the regression test pass.
- [x] Add and run a failing regression test for bounded outward error context.
- [x] Implement the minimal bound and make focused tests pass.
- [x] Run orchestrator and repository test, lint, typecheck, build, and secret-scan gates.
- [ ] Commit with the required identity, push, and open one PR linked to issue #3662.
- [ ] Resolve exact-head GitHub Codex findings, verify zero unresolved threads and green CI, then guarded squash-merge.
- [ ] Verify issue #3662 closes and complete the Kanban handoff.
