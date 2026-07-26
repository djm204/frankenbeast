# Issue #3729 progress

- [x] Fetch issue #3729 and parent #3726 with current comments/state.
- [x] Confirm no existing implementation or active PR owns the issue.
- [x] Align this isolated worktree branch to freshly fetched `origin/main`.
- [x] Trace `BeastRunService` lifecycle transitions, persistence/query surfaces, and orphan sweep behavior.
- [x] Choose the minimal additive aggregation/query design within issue scope.
- [x] Add focused failing lifecycle aggregation tests and verify RED.
- [x] Add focused failing orphan-counter test and verify RED.
- [x] Implement the minimal production changes and verify GREEN.
- [x] Run focused tests and relevant package typecheck/build gates.
- [x] Review diff for scope, correctness, and real-data-only behavior.
- [x] Commit and push with David Mendez <me@davidmendez.dev> identity.
- [x] Open one PR closing #3729.
- [ ] Obtain exact-head Codex all-clear, zero unresolved threads, and green CI.
- [ ] Merge PR and verify issue closure, merge SHA, and clean worktree.
- [ ] Record durable Kanban handoff evidence.
