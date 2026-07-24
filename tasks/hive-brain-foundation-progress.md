# Hive Brain Foundation #3685 Progress

- [x] Verify the live issue is open and no existing PR owns it.
- [x] Sync the isolated issue branch to current `origin/main`.
- [x] Read required brain contracts, implementation, tests, package manifests, docs, ADR, and shared lessons.
- [x] Confirm `IBrain` has no planning/reasoning/action/learning faculties and no `BrainRegistry` exists on `origin/main`.
- [x] Add type-level and runtime regression tests; observe expected RED failures.
- [x] Add additive faculty interfaces and no-op `SqliteBrain` faculty surfaces.
- [x] Implement process-local `BrainRegistry.forAgentType()` with stable instances and safe opaque identifiers, without persistence-path or adapter wiring scope.
- [x] Update package and architecture/onboarding documentation without changing orchestrator wiring.
- [x] Run full `franken-types` and `franken-brain` tests, integration tests, typecheck, lint, and build gates.
- [ ] Commit with the required identity, push, open one PR closing #3685, and verify CI.
- [ ] Complete current-head Codex review, resolve findings, and merge only when all gates are green.
- [ ] Append a compact reusable lesson and leave Kanban/root blackboard terminal evidence.
