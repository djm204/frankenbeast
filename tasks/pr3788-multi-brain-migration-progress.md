# PR #3788 multi-brain publisher migration repair progress

- [x] Confirm canonical worktree and exact PR head `9bd207dbf44a02e801d4ffda2e61fab73e860986`.
- [x] Read card, parent verifier evidence, package README, and shared lessons.
- [x] Reproduce the same-type second-brain publication loss with a focused RED test.
- [x] Implement a shared-Hive, concurrency-safe once-per-namespace legacy migration marker while preserving distinct durable publisher identities.
- [x] Add/verify restart persistence, first-time legacy purge, unrelated namespace preservation, and concurrent initialization coverage.
- [x] Run focused Hive tests and full `@franken/brain` test/lint/typecheck/build plus `git diff --check` (497/497 tests; concurrent migration stress 10/10).
- [x] Independently audit the diff for blocking data-loss/concurrency/privacy regressions; fixed the checkpoint race, additive-Hive restart finding, and pre-marker durable-ID privacy gap, then reran all gates.
- [x] Commit with David Mendez identity and record the immutable fast-forward push command for Hive Approval Cop.
- [ ] Route the authorized push through Hive Approval Cop; do not trigger Codex or merge.
- [ ] Verify exact-head 4/4 CI, resolve only current threads if any, and post evidence to verifier/root cards.
