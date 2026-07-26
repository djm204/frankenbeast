# Brain Vitals #3731 progress

- [x] Verify #3727–#3730 are closed and their merge commits are present on fresh `origin/main`.
- [x] Read #3731, parent handoffs, existing cache/compaction/lifecycle/resource APIs, and SQLite persistence conventions.
- [x] RED→GREEN: add a pure, configurable 0–100 health-score formula with directionality and validation tests.
- [x] RED→GREEN: add on-demand score computation/persistence keyed by brain id.
- [x] RED→GREEN: add latest-score and bounded time-range history queries for direct and worker-backed SQLite paths.
- [x] Export the public API and document the v1 formula, weights, normalization, and on-demand rationale.
- [x] Run focused tests plus `@franken/observer` test, lint, typecheck, and build gates.
- [ ] Commit and push the unique issue branch; open exactly one PR closing #3731.
- [ ] Complete exact-head GitHub Codex review loops, resolve all threads, and verify exact-head CI.
- [ ] Squash-merge, verify #3731 closed, and record merge/test/review evidence.

## V1 decisions

- Use six normalized inputs: task success, cache-hit ratio, compaction pressure, lifecycle churn/discard pressure, resource pressure, and budget burn ratio. This includes all four wave-one signals plus task outcomes and budget pressure.
- Default weights prioritize outcome quality (30%), then cache efficiency, context stability, lifecycle stability, and budget headroom (15% each), with resource efficiency at 10%. The config remains replaceable and must sum to 1.
- Compute and persist on demand rather than starting a hidden timer. Callers control sampling cadence, and each computation becomes an immutable time-series observation.
- Keep `brainId` generic so callers can pass the current `definitionId`/`agentTypeId` and later re-key to Brain Registry ids without changing scoring semantics.
