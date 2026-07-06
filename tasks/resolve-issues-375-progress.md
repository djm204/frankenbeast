# Resolve issue #375 progress

- [x] Read Kanban context, parent handoff, PM/root blackboard, and shared lessons.
- [x] Refresh live GitHub issue/PR state; issue #375 is open and no duplicate open PR exists.
- [x] Create isolated worktree `/home/pfkagent/dev/resolve-wt/issue-375` and branch `resolve/issue-375-api-contracts` from `origin/main`.
- [x] Inspect duplicated web/API DTO definitions and existing shared type packages.
- [x] Implement scoped shared DTO fix in `@franken/types` for chat, beast, and network API envelopes/DTOs.
- [x] Update web chat/beast/network API clients to import/re-export shared DTOs instead of local duplicates.
- [x] Update orchestrator chat/network response code and chat persisted schemas to use shared DTO contracts.
- [x] Add tests proving shared API contract schemas and envelope types are consumable.
- [x] Run full typecheck/build and targeted tests. Full `npm test` has unrelated flaky timeout in `@franken/critique` safety test; isolated retry of that test passed.
- [ ] Commit, push, and open exactly one PR with `Closes #375`.
- [ ] Run current-head GitHub Codex review loop and address findings.
- [ ] Merge only after CI and Codex are clean, then update shared lessons and complete/block Kanban.

Verification so far:
- PASS `npm run typecheck`
- PASS `npm run build`
- PASS `npm test --workspace @franken/types -- tests/api-contracts.test.ts`
- PASS `npm test --workspace @franken/web -- tests/lib/api.test.ts tests/lib/beast-api.test.ts src/lib/network-api.test.ts`
- PASS `npm test --workspace packages/franken-orchestrator -- tests/unit/chat/types.test.ts`
- FAIL then PASS-on-isolated-retry: `npm test` failed only in `@franken/critique` test `SafetyEvaluator > allows disjoint and deterministic repeated alternatives` due 5000ms timeout; `npm test --workspace @franken/critique -- tests/unit/evaluators/safety.test.ts -t "allows disjoint and deterministic repeated alternatives"` passed.
