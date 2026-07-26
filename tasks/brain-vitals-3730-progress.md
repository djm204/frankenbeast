# Brain Vitals #3730 progress

- [x] Fetch issue #3730, comments, and parent #3726 from live GitHub.
- [x] Confirm issue is open, still missing on fresh `origin/main`, and within Brain Vitals scope.
- [x] Confirm isolated clean worktree at fresh `origin/main` with required git identity.
- [x] Inspect observer SQLite and process-supervisor integration patterns.
- [x] RED: add and run a real child-process sampling test.
- [x] RED: add and run deterministic power-estimate tests.
- [x] RED: add and run SQLite persistence/time-range query tests.
- [x] GREEN: implement the minimal sampler, estimator, interval lifecycle, and SQLite persistence.
- [x] Export and document the public resource telemetry API and caveats.
- [x] Run focused observer tests, typecheck, build, lint, and relevant repository gates.
- [x] Commit and push the issue branch; open PR #3795 closing #3730.
- [x] Obtain exact-head CI success and a clean Codex review with zero unresolved threads: head `afd15536fee9957ff1e4afde53ac6425c577fd65` passed 4/4 checks with 8 threads / 0 unresolved.
- [x] Merge, verify issue closure and clean worktree, and record the final handoff: PR #3795 merged as `f39e2ad6673d4eade82ffb4b0ae6ba7897173110`; issue #3730 is `CLOSED/COMPLETED`; implementation handoff `t_dde334ff` and verifier `t_8aa0af15` passed.

## Verification notes

- Focused resource tests: 20 passed, covering a real spawned process, CPU/RSS, estimates, configurable intervals, monotonic energy, async lifecycle draining, persistence, indexed queries, and explicit retention pruning.
- Observer package: 38 files / 947 tests passed; lint, typecheck, and build passed.
- Repository lint, typecheck, and build passed. Full concurrent repository test runs exposed unrelated orchestrator timing flakes; every reported failing file passed in isolation while the observer package remained green.
- Independent review findings on lifecycle overlap, query-plan index use, identifier normalization, and import-time child-process mocking were resolved; the second pass reported no additional findings.
