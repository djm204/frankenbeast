# Issue #3694 Retention Enforcement Progress

- [x] Recover the approved fresh branch aligned to `origin/main`.
- [x] Verify issue #3694 is open and no open PR owns it.
- [x] Read current retention policy/report code and tests, checkpoint/episodic stores, package README, current ADR-041 (the issue's ADR-039 reference is stale), architecture/onboarding docs, and shared lessons.
- [x] Define a bounded explicit compaction contract that reuses report candidates and excludes lessons-aware pruning and default-path work.
- [x] Add a focused regression test and observe the expected RED failure.
- [x] Implement minimal atomic episodic/checkpoint retention enforcement and observe focused GREEN.
- [x] Document invocation choice, safety bounds, and priority/oldest-first v1 tradeoff; ADR-041 has no retention gap to update.
- [x] Run full relevant brain tests, lint, typecheck, and build.
- [x] Independently review the current diff and fix all blocking findings.
- [x] Commit as David Mendez <me@davidmendez.dev>, push, and open one PR with `Closes #3694`.
- [x] Resolve Codex's tied-timestamp keyset finding on current head and pass exact-head CI.
- [x] Address the fresh Codex round's MCP scan-bound/audit findings with focused RED/GREEN plus full MCP test, lint, typecheck, and build verification.
- [x] Publish the follow-up commit through Approval Cop and verify exact-head CI green.
- [x] Address Codex round 4 checkpoint-progress, working-scan-bound, and embedding-projection findings with focused RED/GREEN and full brain gates.
- [ ] Publish the round-4 follow-up through Approval Cop, then reach current-head Codex clean with zero unresolved Codex threads and green CI before exact-head merge.
- [ ] Append reusable lessons and post terminal evidence to root task `t_7b3979ad`.
