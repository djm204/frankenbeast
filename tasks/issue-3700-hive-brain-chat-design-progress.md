# Issue #3700 Hive Brain chat design progress

- [x] Read the live issue and confirm no open PR owns #3700.
- [x] Sync the isolated issue branch to current `origin/main`.
- [x] Read PM/root handoffs, epic progress, and shared lessons.
- [x] Locate ADR-039 or establish its live source/status without guessing.
- [x] Trace the existing chat runtime, session persistence, WebSocket/REST contracts, web client, BrainRegistry dependency, and governor-gated dispatch path.
- [x] Write concrete transport, entity/namespace, migration, persistence/API, and dispatch decisions with implementation-child acceptance mapping.
- [x] Address independent review findings: enforce one conversation per
  user/workspace, persist supervised-agent/summary state, use the planned
  registry API additively, and lock on canonical conversation id.
- [x] Synchronize architecture, ramp-up, and relevant package documentation.
- [x] Add narrow documentation/contract regression coverage supported by repository convention.
- [x] Run focused tests plus applicable typecheck/build/docs checks. (`docs-issue-3700`: 3/3 pass; all newly added relative links resolve. Root typecheck/build were attempted but the worktree resolves `@franken/types` through the primary checkout's shared `node_modules`, producing unrelated missing-export errors in brain/observer.)
- [ ] Commit with the required identity, push, and open one PR that closes #3700.
- [ ] Resolve real current-head Codex feedback, verify CI/threads, and merge.
- [ ] Append reusable lessons and publish terminal Kanban/blackboard evidence.
