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
