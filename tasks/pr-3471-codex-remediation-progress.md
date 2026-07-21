# PR #3471 Codex remediation progress

- [x] Verify isolated workspace, GitHub authentication, and exact live PR head.
- [x] Inspect the five current-head Codex findings.
- [x] Trace affected adapter and SQLite implementations and existing tests.
- [x] Add focused failing regression(s) for adapter all-scope backfill and strict quarantine envelope detection.
- [x] Implement minimal adapter fixes and pass focused tests (72/72).
- [x] Add focused failing regression(s) for plaintext recall re-scoring, scoped retention fail-closed behavior, and quarantined audit preservation.
- [x] Implement minimal SQLite fixes and pass focused tests (270/270).
- [x] Run full relevant tests (brain 325/325; MCP suite 605/605), lint, typecheck, and build. Root test sweep has one unrelated orchestrator cleanup-test timeout at `dep-factory-providers.test.ts:258`.
- [x] Commit only scoped code/test changes.
- [x] Fast-forward the existing PR branch after exact-head verification.
- [x] Reply to and resolve Codex threads 3624887842, 3624887846, 3624887851, 3624887854, and 3624887856.
- [x] Confirm zero target Codex threads remain unresolved.
- [ ] Record review handoff evidence on the kanban card.
- [ ] Block the task for required human review.

## Review handoff notes

- Current implementation commit: `e7915c8e2f60b25abe299380b0b3dce563567c65`.
- Root `npm run test` reached 8/10 successful package tasks and was blocked only by an unrelated existing 5-second timeout in `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts:258`; the same test timed out in isolation.
- CI `build-test-lint (1337)` is blocked at the dependency vulnerability audit; local lint, typecheck, build, and both affected package suites pass.
- A delayed Codex review produced three new current-head threads after the scoped five were fixed. The invocation count already exceeds the review-loop cap, so no further trigger was sent; the reviewer must triage threads `PRRT_kwDORezACM6SsqCC`, `PRRT_kwDORezACM6SsqCE`, and `PRRT_kwDORezACM6SsqCJ`.