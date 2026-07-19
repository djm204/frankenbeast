# Issue #3307 progress — stage-aware planning UX

- [x] Emit structured planning lifecycle events from graph construction.
- [x] Surface bounded heartbeat, stage/total timing, skipped stages, retries, fallback, completion, failure, and cancellation in the CLI.
- [x] Stop progress rendering during interactive review and resume it for revisions.
- [x] Preserve recoverable drafts and report the active stage on Ctrl-C.
- [x] Cover event ordering, fallback/retry behavior, spinner timing, and session cancellation with unit tests.
- [x] Rebase onto `origin/main` and pass targeted tests, orchestrator tests, root build, typecheck, and lint.
- [ ] Open PR and complete CI/Codex review gate.
- [ ] Merge and verify issue closure.
