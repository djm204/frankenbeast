# Hive Brain durable paths (#3693) progress

- [x] Verify issue ownership, live issue state, no existing PR, and branch from current `origin/main`.
- [x] Read the merged #3685 foundation, `packages/franken-brain/README.md`, dependency wiring, accepted ADR-041, architecture docs, and shared lessons.
- [x] Add failing tests for durable per-agent-type isolation, explicit `:memory:` opt-out, and tracked-run identity propagation.
- [x] Implement safe default `.fbeast/brains/<agentTypeId>.db` resolution in `BrainRegistry`.
- [x] Thread canonical Beast `definitionId` through spawned run config into `BeastDepsConfig` and registry-backed brain construction.
- [x] Verify `.gitignore` coverage for brain databases and SQLite sidecars (`.fbeast/` ignores the full state tree).
- [x] Update package/architecture/onboarding documentation and the accepted ADR-041 (the live successor to the issue's stale ADR-039 reference).
- [x] Run focused and package-level `franken-brain` and `franken-orchestrator` tests, then typecheck, lint, and build.
- [x] Self-review the local diff and resolve both independent review findings (retry identity and portable filename bounds).
- [ ] Commit with required identity, push one PR closing #3693, and reach green CI/current-head Codex clean.
- [ ] Merge, append reusable lessons, and update root Kanban card with terminal evidence.
