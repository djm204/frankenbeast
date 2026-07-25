# Issue #3702 Hive-aware status query progress

- [x] Verify exact clean starting HEAD `fb611078254384968c916940d351ceac172816c9` and create `resolve/issue-3702-hive-status-current-v2` in this worktree.
- [x] Verify issue/PR ownership and inspect live #3702, merged #3700/#3689, ADR-041, hive store, tracked-agent/run stores, routes, docs, and shared lessons.
- [x] Add failing no-`agentId` query regressions for cross-agent status and attribution.
- [x] Implement a bounded workspace-owned hive status query with truthful stale/unavailable states and no dispatch changes.
- [x] Add real-store integration coverage for zero, one, and mixed agent types plus workspace isolation and read failures.
- [x] Update architecture, onboarding, package README, ADR-041, and shared lessons.
- [x] Run focused tests, typecheck, lint, and build; inspect the final diff.
- [ ] Commit with the required identity and publish one PR through Approval Cop.
- [ ] Complete current-head CI/Codex review (maximum five triggers), merge through Approval Cop, and post root evidence.
