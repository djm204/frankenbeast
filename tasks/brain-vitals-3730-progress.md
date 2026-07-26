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
- [ ] Commit and push the issue branch; open one PR closing #3730.
- [ ] Obtain exact-head CI success and a clean Codex review with zero unresolved threads.
- [ ] Merge, verify issue closure and clean worktree, and record the final handoff.

## Verification notes

- Focused resource tests: 17 passed, covering a real spawned process, CPU/RSS, estimates, configurable intervals, serialized/manual drain semantics, persistence, and indexed queries.
- Observer package: 38 files / 944 tests passed; lint, typecheck, and build passed.
- Repository lint, typecheck, and build passed. Full concurrent repository test runs exposed unrelated orchestrator timing flakes; every reported failing file passed in isolation while the observer package remained green.
- Independent review findings on lifecycle overlap, query-plan index use, identifier normalization, and import-time child-process mocking were resolved; the second pass reported no additional findings.
