# Issue 3706 Hive Brain CLI progress

- [x] Verify issue #3706 is open, unassigned, and scoped to read-only CLI inspection.
- [x] Branch from current `origin/main` after merged brain HTTP/faculty work.
- [x] Read two existing CLI command handlers, parser/registration flow, BrainRegistry safety rules, HTTP contract, ADR-041, docs, and shared lessons.
- [x] Add parser tests for `brain show|lessons <agentTypeId>` and `--json`.
- [x] Add failing command tests for bounded human/JSON summaries, safe identifiers, missing brains, and lesson availability.
- [x] Implement direct local read-only BrainRegistry inspection without creating unknown state.
- [x] Update CLI help, architecture/ramp-up/package documentation, and ADR-041.
- [x] Run focused CLI tests, orchestrator tests/gates, compiled CLI smoke checks, root typecheck, and root build.
- [ ] Inspect staged diff, commit as David Mendez, push, and open one PR closing #3706.
- [ ] Drive CI and current-head GitHub Codex review to clean with zero unresolved threads.
- [ ] Merge, post root evidence, append reusable lessons, and finish the Kanban handoff.
