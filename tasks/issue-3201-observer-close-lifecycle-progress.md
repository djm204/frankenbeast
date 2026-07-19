# Issue #3201 Observer close lifecycle progress

- [x] Inspect issue acceptance criteria and shared project lessons.
- [x] Trace every MCP server path that creates or owns an `ObserverAdapter`.
- [x] Add a failing adapter-level SQLite close regression test.
- [x] Add server lifecycle callback and observer shutdown regression tests.
- [x] Expose an idempotent optional `ObserverAdapter.close()` method.
- [x] Wire SDK transport shutdown and explicit server shutdown to owned resources.
- [x] Forward cleanup through combined-server audit and proxy adapter paths.
- [x] Document programmatic lifecycle ownership.
- [x] Run targeted tests and MCP-suite tests, typecheck, lint, and builds.
- [ ] Open the issue PR and complete CI/Codex review gates.
- [ ] Merge and record the terminal Kanban handoff.
