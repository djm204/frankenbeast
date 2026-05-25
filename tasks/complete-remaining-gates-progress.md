# Complete Remaining Gates Progress

## Goal

Complete the remaining Frankenbeast gates in context-friendly chunks without relying on stale checklist state.

## Ground Rules

- Work from isolated worktree: `.worktrees/complete-remaining-gates` on branch `chore/complete-remaining-gates` tracking `origin/main`.
- Treat live code, merged PR state, tests, and task progress docs as source of truth.
- Keep chunks small enough to hand off independently.
- Commit each completed implementation chunk atomically after targeted verification.
- For code changes, use TDD: red test, green implementation, targeted verification, then broader typecheck/build where appropriate.

## Chunks

- [x] Chunk 0: Create isolated worktree from fresh `origin/main` and establish this progress document.
- [x] Chunk 1: Reconcile stale PR #287 and already-merged audit chunk docs/checklists against current `origin/main`.
- [x] Chunk 2: Implement security hardening Chunk 3 — Sandboxed Beast Execution.
- [x] Chunk 3: Implement security hardening Chunk 4 — Durable Audit & Replay.
- [x] Chunk 4: Convert Live CLI Benchmark design into an implementation plan split into context-friendly chunks.
- [ ] Chunk 5: Implement Live CLI Benchmark pipeline chunks.
- [ ] Chunk 6: Reconcile stale dual-mode launch chunks 6–8 and consolidation residual plans against live code.
- [ ] Chunk 7: Final verification, diff review, and handoff.

## Current Findings

- Fresh `origin/main` is ahead of the older persistent memory: PR #296 and PR #297 are merged.
- `origin/main` HEAD at start: `f281e8e fix(security): Chunk 1 — fail-closed HTTP & approval boundaries (#296)`.
- Security hardening Chunk 1 is merged as PR #296.
- Security hardening Chunk 2 is merged as PR #297.
- Remaining security hardening implementation chunks are Chunk 3 and Chunk 4 from `docs/superpowers/plans/2026-05-17-security-hardening-chunks-index.md`.
- Old `tasks/todo.md` still contains stale unchecked PR #287 and review-gate items that need reconciliation.

## Verification Log

- 2026-05-23: `git fetch origin --prune` completed and created worktree `.worktrees/complete-remaining-gates` from `origin/main`.
- 2026-05-23: Reconciled stale PR #287 and PR #296 local checklist items against merged PR state on `origin/main`.
- 2026-05-23: Security hardening Chunk 3 implemented. Red tests failed for missing Docker runtime modules, leaking `GITHUB_TOKEN`, and cwd escape; green verification passed in `packages/franken-orchestrator`: `npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/beasts/execution/process-supervisor.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts` (38 tests) and `npm run typecheck`.
- 2026-05-23: Security hardening Chunk 4 partially implemented in three atomic commits: content-addressed replay blob store, deterministic replay + manifest persistence, and durable Beast phase state snapshots. Verification passed for observer replay/audit tests + typecheck and orchestrator Beast-loop state tests + typecheck. Remaining Chunk 4 task: wire LLM/tool replay record capture through orchestrator adapters, then ADR-037/audit follow-up/final verification.
- 2026-05-23: Security hardening Chunk 4 completed. Added orchestrator LLM/tool replay capture and CLI bridge manifest persistence in `d92b0be`, then ADR-037/audit follow-up/progress reconciliation. Final verification passed: in `packages/franken-observer`, `npm test -- --run src/replay/replay-content-store.test.ts src/replay/deterministic-replayer.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts` (4 files, 19 tests) and `npm run typecheck`; in `packages/franken-orchestrator`, `npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts tests/unit/adapters/audit-observer-adapter.test.ts tests/unit/adapters/cli-observer-bridge.test.ts tests/unit/cli/create-beast-deps.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts` (7 files, 123 tests) and `npm run typecheck`.
- 2026-05-23: Converted approved Live CLI Benchmark design into context-friendly implementation plan `docs/superpowers/plans/2026-05-23-live-cli-benchmark-pipeline.md`. The plan splits work into package skeleton, corpus validation, workspace provisioning, client adapters, config isolation, deterministic scoring, SQLite history, matrix runner, reports/gates, and docs/scheduling handoff.
