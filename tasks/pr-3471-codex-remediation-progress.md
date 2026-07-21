# PR #3471 Codex remediation progress

- [x] Verify isolated workspace, GitHub authentication, and exact live PR head.
- [x] Inspect the five current-head Codex findings.
- [x] Trace affected adapter and SQLite implementations and existing tests.
- [x] Add focused failing regression(s) for adapter all-scope backfill and strict quarantine envelope detection.
- [x] Implement minimal adapter fixes and pass focused tests (72/72).
- [x] Add focused failing regression(s) for plaintext recall re-scoring, scoped retention fail-closed behavior, and quarantined audit preservation.
- [x] Implement minimal SQLite fixes and pass focused tests (270/270).
- [x] Run full relevant tests (brain 325/325; MCP suite 605/605), lint, typecheck, and build. Root test sweep has one unrelated orchestrator cleanup-test timeout at `dep-factory-providers.test.ts:258`.
- [ ] Commit only scoped code/test changes.
- [ ] Update the existing PR branch with lease safety.
- [ ] Reply to and resolve Codex threads 3624887842, 3624887846, 3624887851, 3624887854, and 3624887856.
- [ ] Verify exact remote head and zero unresolved target Codex threads.
- [ ] Record structured review handoff and block for reviewer approval.
