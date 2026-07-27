# Issue #3812 runtime adapter progress

- [x] Verify isolated worktree root, dedicated branch, clean status, and exact `origin/main` base.
- [x] Read the live GitHub issue and lock scope away from Hive Brain and coordinator bookkeeping.
- [x] Inspect live Hermes global/board SQLite schemas and representative canonical state.
- [x] Trace existing orchestrator operator authentication, SSE replay/heartbeat/rate-limit, and redaction conventions.
- [x] Add failing reusable provider-neutral contract/schema/registry tests.
- [x] Implement the minimal runtime DTO schemas, capability model, adapter interface, and registry.
- [x] Add failing Hermes adapter integration tests using temporary supported-schema SQLite databases.
- [x] Implement safe read-only Hermes discovery, normalized snapshots, bounded activity, cursors, schema/degraded states, and redaction.
- [x] Add failing authenticated HTTP provider-list/snapshot/SSE tests.
- [x] Implement provider-neutral authenticated HTTP routes and ticket-authenticated SSE replay/heartbeat/rate-limit behavior.
- [x] Run focused tests, package tests, root tests, lint, typecheck, and build.
- [x] Self-review the complete diff and verify no Hive Brain files or synthetic production data were introduced.
- [x] Commit as David Mendez <me@davidmendez.dev>, push, and open PR #3821 with `Closes #3812`.
- [ ] Trigger real GitHub `@codex review`; resolve accepted findings and all Codex-authored threads.
- [ ] Verify exact-current-head clean Codex and green CI; do not merge.
- [ ] Record structured handoff on the task/root blackboard and block for review.

## Inherited contract follow-up

- [x] Recover exact PR #3821 head `9d7393fa76f2c00ddbbc2ceb9010d287550eac4e` in the authorized clean worktree.
- [x] Reproduce or falsify the nine inherited findings from downstream PR #3834.
- [x] Add RED-to-GREEN coverage for every still-real finding without touching Ollama/downstream scope.
- [x] Run focused and package/root test, lint, typecheck, and build gates.
- [x] Commit and push the existing PR #3821 branch; reply to and resolve inherited review threads with evidence.
- [x] Hand the immutable new #3821 implementation head to stacked owners for rebase/reverification.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Verification notes

- Focused runtime/HTTP tests: 14 passed.
- Full-repository typecheck, build, and lint: passed (lint retains pre-existing warnings).
- Live read-only Hermes smoke: connected/ready with one discovered workspace and bounded cursor activity.
- Full repository test run: all non-orchestrator packages passed; orchestrator reported 4,582 passed and 8 unrelated failures (five load-sensitive 5-second timeouts plus three reproducible baseline failures in `cli/run.test.ts` and `cli/network-run.test.ts`). No failing file imports or exercises the runtime-adapter surface.
- Self-review tightened cursor replay beyond 500 events, bounded SSE polling queries, current-run agent/session mapping, invalid-timestamp degradation, and route-boundary secret/host-path redaction; no Hive Brain files or synthetic production state were added.
- Tier-12 round 12 findings reproduced RED then remediated: opaque contract fields now bypass generic secret rewriting, disappeared workspace positions compact even on empty pages, configured databases deduplicate by canonical path, intermediate cursors seed represented workspaces before their first page event, missing workspace filters return an honest empty snapshot, and the package root exports the complete runtime schema surface.
- Current remediation verification: focused runtime/HTTP contract suite 56/56 passed; package typecheck, build, and lint-with-errors-only passed; root typecheck, lint, and build passed. The package full suite remains at the established unrelated baseline of 4,637/4,640 passing (one network health partial-state test and two order-dependent CLI run tests).
- Independent pre-commit review passed after two additional TDD hardening cases: quiet-poll cursor compaction, retention for temporarily unavailable discovered workspaces, and plural identifier-array redaction boundaries.
- Inherited follow-up RED-to-GREEN coverage now enforces a bounded active-stream pool with early-abort release, honest empty snapshots for every missing workspace filter, leading slash-command arguments, one-observation cursor grace for transiently missing databases, request cancellation, legacy cursor workspace binding, punctuation-boundary host-path redaction, stable verified-operator rate-limit identity, and public `RuntimeApproval` type exports.
- Current follow-up verification: focused runtime/HTTP contract suite 75/75 passed; package and root typecheck, lint (zero errors; pre-existing warnings), and build passed; `git diff --check` passed. The package full suite reached 4,646/4,649, with only the established unrelated `cli/network-run.test.ts` partial-state failure and two order-dependent `cli/run.test.ts` failures, each reproduced independently and outside the runtime-adapter diff.
- The first exact-head Codex pass on `7ab5c52f4` found six additional issues; each was reproduced RED and fixed GREEN: URL preservation, retryable capacity admission, route-safe provider IDs, permanent polling failure closure, discovery-failure preservation under filters, and Node timer upper bounds.
- Expanded focused runtime verification passes 79/79 tests; package typecheck, lint (zero errors), and build pass after the second review round.
