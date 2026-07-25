# Issue #3728 — Compaction observer metric progress

- [x] Confirm issue scope and start from a clean `origin/main` worktree.
- [x] Add RED→GREEN SQLite persistence coverage for compaction events.
- [x] Add RED→GREEN windowed `compactionRate()` aggregation coverage.
- [x] Add RED→GREEN Martin-loop threshold compaction telemetry coverage.
- [x] Add RED→GREEN production dependency wiring coverage for the canonical traces database.
- [x] Document the compaction observer flow in `docs/ARCHITECTURE.md`.
- [x] Run repository tests, lint, typecheck, and build.
- [x] Audit the final diff against `origin/main`.
- [x] Commit, push, and open PR #3780 linked to #3728.
- [ ] Run the GitHub Codex review loop until the current head is clean.
- [ ] Hand off for human review without merging.

## Verification evidence

- `npx vitest run src/compaction-metrics.test.ts src/adapters/sqlite/SQLiteAdapter.test.ts`: 21/21 passed.
- Focused orchestrator run: 116/117 passed across Martin loop, dependency wiring, and bridge finalization; the sole unrelated CritiquePortAdapter assertion also passes in the full scoped run. A final five-test compaction/finalizer selection passed 5/5.
- `npx turbo run test --filter=@franken/orchestrator --filter=@franken/observer`: observer passed; orchestrator reached 4,496/4,498 passing with two unrelated 5-second timeout failures. The cleanup timeout passes alone; the process-redaction timeout remains slow and is outside this diff.
- `npm run lint`: passed (pre-existing warnings only).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Scope audit: branch is based directly on `origin/main`; no TokenCounter, CostCalculator, provider, Hive Brain, Brain Vitals API/UI, or #3727 cache-accounting changes are present.
- Codex round 1 findings addressed with RED→GREEN coverage: telemetry is emitted only after canonical-session persistence, SQLite failures are best-effort, and before/after token estimates measure the same appended transcript boundary.
- Codex round 2 findings addressed with RED→GREEN coverage: adapter shutdown is best-effort, event timestamps use the same wall clock as rate windows, and `compactAndRecord()` provides an explicit persisted manual-compaction path.
- Codex round 3 findings addressed with RED→GREEN coverage: rate windows have an upper bound, trace deletion removes run compaction rows, telemetry requires post-compaction token measurement, and SQLite telemetry initialization is best-effort.
- Final focused observer verification: 22/22 passed; focused orchestrator verification: 56/56 passed.
- Final package verification: observer 902/902 passed; orchestrator 4,506/4,506 passed after adding required token-measurement fixtures to two existing Martin-loop telemetry tests.
- Final root `npm run lint`, `npm run typecheck`, and `npm run build`: passed (pre-existing lint warnings only).
- Codex round 4 findings addressed: compaction rows are pruned outside a 24-hour window, run identity participates in the SQLite primary key with a legacy-schema migration, and consolidated provider overrides are validated before observer storage opens.
- Round 4 focused verification: observer 25/25 passed; dependency-factory provider wiring 52/52 passed.
- Round 4 package verification: observer 905/905 passed; orchestrator 4,507/4,507 passed.
- Round 4 root `npm run lint`, `npm run typecheck`, and `npm run build`: passed (pre-existing lint warnings only).
