# Issue #3310 — Ambient Claude Session Continuation Progress

- [x] Read issue, shared lessons, and affected cache/provider code.
- [x] Add regression coverage proving the first cache-managed call starts an isolated persisted session without ambient continuation.
- [x] Add regression coverage proving subsequent calls resume only the captured provider session ID.
- [x] Prevent silent duplicate provider calls after native-session errors.
- [x] Retry exactly once with a fresh isolated session for classified stale/invalid provider-session failures.
- [x] Run focused orchestrator tests.
- [x] Run orchestrator typecheck, lint, and build.
- [x] Commit and open a single issue-scoped PR with `Closes #3310`.
- [ ] Obtain green CI and current-head Codex clean with zero unresolved Codex threads.
- [ ] Squash-merge, verify issue closure, and record any reusable lesson.
