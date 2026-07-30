# Issue 3848 — Report LessonRecorder failures safely

- [x] Revalidate issue state, labels, branch/worktree ownership, competing PRs/branches, base SHA, and Git identity.
- [x] Read shared lessons and inspect LessonRecorder implementation plus neighboring logging patterns.
- [x] Build and run a focused red-capable regression for a rejected `memory.recordLesson` call.
- [x] Record reproduction, observed/expected behavior, affected path, and root cause on the Kanban card.
- [x] Implement the narrowest safe non-fatal operator diagnostic without raw lesson/error payloads.
- [x] Run focused tests, package lint/typecheck/build/tests, repository gates, and secret scanning.
  - `@franken/critique`: 800 tests pass; lint, typecheck, and build pass.
  - Root lint, typecheck, and build pass. Root tests pass all assertions on retry but remain non-zero because an unrelated orchestrator runtime-contract test leaves a Codex app-server rejection unhandled; the implicated runtime test file passes 55/55 in isolation.
- [x] Self-review the diff; no public API or architecture documentation change is warranted.
- [ ] Commit conventionally as David Mendez, push, open the one issue PR, and verify exact local/remote/PR head equality.
- [ ] Drive CI and the real GitHub Codex connector to current-head clean with zero unresolved threads.
- [ ] Squash-merge the immutable gated head, verify issue closure, and terminalize the Kanban card.
