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

## Exact-head round 19 follow-up

- [x] Recover PR #3821 exact head `4086791b0468d62c047d798fe74f337e89d12c65` and inspect all five current-head Codex findings.
- [x] Reproduce and remediate legacy workspace cursor ordering, valid-stream admission isolation, all-source event failures, missing explicit databases, and workspace-scoped inspection.
- [x] Run focused and package/root test, lint, typecheck, and build gates.
- [x] Commit and push the existing PR #3821 branch; reply to and resolve all five current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 20 follow-up

- [x] Inspect the three current-head Codex findings on `15e913442fefe40d1796502de1f1dc733dc794d4`.
- [x] Reproduce and remediate legacy-cursor outage retention, file-URL host-path redaction, and active profile discovery without current-run pointers.
- [x] Run focused and package test, lint, typecheck, and build gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all three current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 21 follow-up

- [x] Inspect the three current-head Codex findings on `7d7a18eba55d02ff96bb815c183370e29fe0884b`.
- [x] Reproduce and remediate scoped cursor outage retention, contextual API-route redaction, and stale pointerless-run fallback.
- [x] Run focused tests plus package lint, typecheck, and build gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all three current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 22 follow-up

- [x] Inspect the three current-head Codex findings on `1ffdbce6e37b572c0097ca07642157e37a7bb019`.
- [x] Reproduce and remediate Markdown-code host-path leakage, valid-ticket rate-limit consumption, and unbounded heartbeat write queuing.
- [x] Run focused tests plus package lint, typecheck, build, and full-suite gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all three current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 23 follow-up

- [x] Inspect the three current-head Codex findings on `0d91974d61aecfc49e33f39070097d7dbb098268`.
- [x] Reproduce and remediate quoted single-component/Windows path redaction, stable operator rate-limit bucketing, and blank workspace-filter rejection.
- [x] Run focused tests plus package/root lint, typecheck, build, and full package test gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all three current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 24 follow-up

- [x] Inspect the current-head Codex finding on `770dd1369dee06c019cbd14b25389dd540138007`.
- [x] Reproduce and remediate direct-adapter leakage of unquoted single-component POSIX paths.
- [x] Run the 58-test Hermes adapter suite plus package lint, typecheck, and build gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve the current-head thread.
- [ ] Obtain exact-head green CI and fresh Codex clean; authorized review tier 24 is exhausted and requires explicit extension.

## Exact-head round 25 follow-up

- [x] Extend the bounded review tier from 24 to 50 as authorized by the PM handoff and trigger exact-head review on `6d55562fe9896133e6e134e0f6676605e61c5165`.
- [x] Reproduce and remediate quoted direct-adapter host paths, NUL SSE cursor IDs, and short-lived stream-ticket cookies.
- [x] Run 115/115 focused adapter, route, and ticket-store tests plus package lint, typecheck, and build gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all three current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 26 follow-up

- [x] Inspect the five current-head Codex findings on `c2f9449412381f85d3298d9430c0437b47f8a1a9`.
- [x] Reproduce and remediate normalized agent state, injected ticket-store cookie lifetime, queued heartbeat teardown, cursor-error redaction, and quoted paths containing spaces.
- [x] Run 134/134 focused adapter, route, redaction, and ticket-store tests plus package lint, typecheck, and build gates.
- [x] Commit and push the PR #3821 branch; reply to and resolve all five current-head threads.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 27 follow-up

- [x] Inspect the four current-head Codex findings on `3b1faa663b6b07528efdf48e44cbb023f8dc71d8` and reproduce each behavior with a failing regression test.
- [x] Make quote-aware path redaction tolerate apostrophes within double-quoted paths in both shared response redaction and direct adapter normalization.
- [x] Rate-limit valid-ticket stream attempts before cursor validation, refresh consumed-ticket tombstones throughout active streams, and bound snapshot run reads while retaining the current run.
- [x] Verify all 137 affected tests plus package typecheck, lint (pre-existing warnings only), and build.
- [x] Commit/push the fixes; reply to and resolve all four Codex threads; trigger the next exact-head review within the authorized tier-50 policy.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 28 follow-up

- [x] Inspect the four current-head Codex findings on `faaf1b252848be8b07a70d0d3e0e27a6bca76bc5` plus the two carried round-27 threads.
- [x] Reproduce and remediate latest pointerless-run selection, blank-outcome fallback, direct workspace discovery, session-lifetime reconnect cookies, and retention-aware consumed-ticket refresh scheduling.
- [x] Verify 124/124 focused adapter, route, and ticket-store tests plus package/root typecheck, lint, and build.
- [x] Commit/push the fixes as `936eb20ae0672226f92a8b47ec18009146548437`; reply to and resolve all applicable Codex threads; trigger the next exact-head review within the authorized tier-50 policy.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 29 follow-up

- [x] Trigger the fresh exact-head review at `2026-07-27T08:07:42Z`; verify `936eb20ae0672226f92a8b47ec18009146548437` completed 4/4 CI checks green.
- [x] Reproduce and remediate complete quoted `file://` URL redaction, best-effort retention-refresh exception containment, bounded pointerless/current run selection, and configured-path scoped identity deduplication.
- [x] Verify the cursor-sensitive-text finding was already covered by the global `errorHandler`: the route response returned `token=<redacted>` and never exposed `secret-value`; avoid redundant route-local behavior.
- [x] Verify 146/146 focused tests, package/root typecheck-lint-build, and `git diff --check`; full package suite remains at the established unrelated three-failure baseline (4,700/4,703 passing).
- [x] Commit/push round 29 as `188ee726d8560648dafe07b562143e0f19ce66c5`; reply to and resolve all six threads; trigger the next exact-head review within the authorized tier-50 policy.
- [ ] Obtain exact-head green CI, fresh Codex clean, and zero unresolved paginated Codex threads; do not merge.

## Exact-head round 30 follow-up

- [x] Push `188ee726d8560648dafe07b562143e0f19ce66c5`; reply to/resolve all six round-29 threads; verify 4/4 exact-head CI checks green; trigger Codex at `2026-07-27T08:41:10Z`.
- [x] Reproduce and remediate stopped-run cancellation normalization, angle-bracket host-path redaction in shared/direct DTO paths, and dot-segment scoped workspace traversal.
- [x] Verify, commit/push round 30 as `8b0c4707f263de11d5edb2f3afb2e2e690b7fd9e`, resolve all three threads, and trigger a fresh exact-head review.

## Exact-head round 31 follow-up

- [x] Inspect the three current-head Codex findings on `8b0c4707f263de11d5edb2f3afb2e2e690b7fd9e` and reproduce each behavior with a failing regression test.
- [x] Exclude pointerless active runs superseded by newer terminal runs, redact host paths after shell redirection delimiters, and sanitize asynchronous SSE adapter failures before Hono logs them.
- [x] Run focused/package/root verification, commit/push, and reply to and resolve all three threads.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads; do not merge.

## Exact-head round 32 follow-up

- [x] Push round 31 as `d39a5664c7fac2dc2136d64da2f947859e07e0e8`, resolve all three threads, verify zero paginated unresolved threads, and trigger Codex at `2026-07-27T09:26:39Z`.
- [x] Reproduce and remediate unquoted file-URL delimiter loss, conjunction-based API-route path leakage, and empty compact/legacy cursor workspace IDs.
- [x] Run focused/package/root verification, commit/push, and reply to and resolve all three threads.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads; do not merge.

## Exact-head round 33 follow-up

- [x] Push round 32 as `d24af159a3a853bcfd6997f32888537a7a583902`, resolve all three threads, verify zero paginated unresolved threads, and trigger Codex at `2026-07-27T09:45:59Z`.
- [x] Reproduce and remediate host-path leakage inside unquoted API-route query and fragment values in shared and direct-adapter redaction.
- [x] Run focused/package/root verification, commit/push, and reply to and resolve the thread.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads; do not merge.

## Exact-head round 34 follow-up

- [x] Push round 33 as `a2da5e462a2a54c10005d1381acfc44d84e803fa`, resolve the thread, verify zero paginated unresolved threads, and trigger Codex at `2026-07-27T10:06:38Z`.
- [x] Reproduce and remediate pointerless-run session loss, URL-encoded host-path leakage, transient periodic stream-poll termination, and delayed initial heartbeat startup.
- [x] Run focused/package/root verification, commit/push, and reply to and resolve all four threads.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads; do not merge.

## Exact-head round 35 follow-up

- [x] Inspect the four current-head Codex findings on `4804feb758b13841eeea52c255d14b74bf145a7f` and reproduce the three behavior findings with failing regression tests.
- [x] Bound repeated periodic polling failures, preserve bracketed-host URL paths, bound replay-safe SSE cursor IDs, and reconcile stale progress-ledger items.
- [x] Run focused/package/root verification.
- [x] Commit/push implementation commit `94b9c9394`; reply to and resolve all four threads.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads within the authorized tier-50 cap; do not merge.

## Exact-head round 36 follow-up

- [x] Inspect the four current-head Codex findings on `2824fb40f106541e307b2ac5ebb747d451e25dde`; reproduce stalled-poll overcounting, oversized multi-workspace SSE cursors, and repeated signaled source inspection RED.
- [x] Count only newly started poll attempts, compact Hermes cursor timestamps/workspace IDs within the 4 KiB SSE bound, and share signaled source inspection for one-second polling windows.
- [x] Verify `task_events.task_id` was already required by `REQUIRED_SCHEMA`; the proposed regression passed before implementation, so no production change was warranted for that finding.
- [x] Run focused, package, and root verification.
- [x] Commit/push `438e8bd68`, reply to and resolve all four threads, and reconcile this ledger.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads within the authorized tier-50 cap; do not merge.

## Exact-head round 37 follow-up

- [x] Inspect the five current-head Codex findings on `a5fc16e704ae00933f73c8fd3f9fb5737db5ce3a` and reproduce each behavior with a focused RED regression.
- [x] Preserve ordinary closing markup tags while retaining angle-bracket multi-segment host-path redaction.
- [x] Bound shared Hermes source-inspection caching at 64 workspace scopes and evict expired/oldest entries.
- [x] Enforce replay-safe SSE cursor limits in UTF-8 bytes and remove untrusted provider IDs from mismatch logs.
- [x] Stop heartbeat timers immediately while cancellation-ignoring polls settle.
- [x] Run focused, package, and root verification.
- [x] Commit/push `3b8b8053c`, reply to and resolve all five threads, and reconcile this ledger.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads within the authorized tier-50 cap; do not merge.

## Exact-head round 38 follow-up

- [x] Inspect the three current-head Codex findings on `afee21d5cf824083382211ec7f3b800bbc34fab7` and preserve the inherited RED regressions after duplicate-owner recovery.
- [x] Deduplicate the default global database during scoped symlink discovery, redact forward-slash UNC paths in shared/direct runtime text, and retry only transient initial polling failures without swallowing permanent/SSE framing errors.
- [x] Commit the round-38 remediation and rebase the branch cleanly onto exact `origin/main` `93337f76436466e89b17cd6371db056373780d54`.
- [x] Run 149/149 focused tests plus package/root typecheck, lint, build, and the full orchestrator suite.
- [ ] Push the rebased existing branch and reply to and resolve all three threads.
- [ ] Obtain fresh exact-head green CI and Codex clean with zero unresolved paginated threads within the authorized tier-50 cap; do not merge.

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
- Expanded focused runtime verification passes 79/79 tests; root tests pass 766/766 with one skip; root typecheck, lint (zero errors), and build pass after the second review round. The orchestrator package suite remains at the established unrelated baseline of 4,651/4,654 passing: one network health partial-state failure and two order-dependent CLI run failures outside the runtime-adapter diff.
- The exact-head `7ec29ac81` Codex round found four further issues; each was reproduced RED and fixed GREEN: direct-adapter punctuation path redaction, immediate stream-slot release during stalled initial polls, optional comment-table column compatibility, and oversized cursor rejection before decoding.
- Expanded focused runtime verification passes 82/82 tests; root tests pass 766/766 with one skip; root typecheck, lint (zero errors), and build pass. The orchestrator package suite remains at the same unrelated three-failure baseline, now 4,654/4,657 passing after the added regression tests.
- The exact-head `b66c0b1bc` Codex round found five further issues; each was reproduced RED and fixed GREEN: cancellable but capacity-accounted stalled polls, failure-preserving SSE writes, context-aware route versus host-path handling, exact opaque session IDs, and optional task-link column compatibility.
- Expanded focused runtime verification passes 86/86 tests; root tests pass 766/766 with one skip; root typecheck, lint (zero errors), and build pass. The orchestrator package suite remains at the same unrelated three-failure baseline, now 4,658/4,661 passing after the added regression tests.
- The exact-head `b88b10449` Codex round found four further issues; each was reproduced RED and fixed GREEN: capacity accounting for stalled periodic polls, single-component absolute-path redaction, cursor-only SSE checkpoint publication, and multiline cursor rejection before SSE framing.
- Expanded focused runtime verification passes 90/90 tests; root tests pass 766/766 with one skip; root typecheck, lint (zero errors), and build pass. The orchestrator package suite remains at the same unrelated three-failure baseline, now 4,662/4,665 passing after the added regression tests.
- Exact-head round 19 reproduced all five findings RED and passes 100/100 focused runtime, route, and ticket-store tests GREEN. Package/root typecheck, lint (zero errors), and build pass; the standalone orchestrator suite remains at the established unrelated three-failure baseline with 4,667/4,670 passing, while all non-orchestrator root package tests pass.
- Exact-head round 20 reproduced all three findings RED and passes 90/90 focused adapter, route, and shared-redaction tests GREEN. Package typecheck, lint (zero errors), and build pass; the standalone orchestrator suite remains at the same unrelated three-failure baseline with 4,671/4,674 passing.
- Exact-head round 21 reproduced all three findings RED and passes 93/93 focused adapter, route, and shared-redaction tests GREEN. Package typecheck, lint (zero errors), and build pass.
- Exact-head round 22 reproduced all three findings RED and passes 96/96 focused adapter, route, and shared-redaction tests GREEN. Package typecheck, lint (zero errors), and build pass; the standalone orchestrator suite remains at the established unrelated three-failure baseline with 4,677/4,680 passing.
- Exact-head round 23 reproduced quoted-path leakage, dynamic-path rate-limit bypass, and blank workspace filter widening RED. The three cases pass GREEN with 42/42 focused HTTP/redaction tests; package/root typecheck, lint (zero errors), and build pass. The standalone orchestrator suite remains at the established unrelated three-failure baseline with 4,680/4,683 passing.
- Exact-head round 24 reproduced direct-adapter leakage of `/secret` RED and passes the Hermes adapter suite 58/58 GREEN; package typecheck, lint (zero errors), and build pass. Review invocation 24/24 is consumed, so a fresh review of the remediation head requires an explicit tier extension.
- Exact-head round 25 reproduced all three findings RED and passes 115/115 focused adapter, route, and ticket-store tests GREEN. Package typecheck, lint (zero errors), and build pass.
- Exact-head round 26 reproduced all five findings RED and passes 134/134 focused adapter, route, redaction, and ticket-store tests GREEN. Package typecheck, lint (zero errors), and build pass.
- Exact-head round 27 reproduced all four findings RED and passes 137/137 focused adapter, route, redaction, and ticket-store tests GREEN. Package typecheck, lint (zero errors; pre-existing warnings only), and build pass.
- Exact-head round 28 reproduced all four new findings RED and passes 124/124 focused adapter, route, and ticket-store tests GREEN. Package/root typecheck, lint (zero errors; pre-existing warnings only), and build pass. The standalone orchestrator suite remains at the established unrelated three-failure baseline with 4,694/4,697 passing.
- Exact-head round 35 reproduced all three behavior findings RED and passes 139/139 focused adapter, route, and redaction tests GREEN. Package/root typecheck, lint (zero errors; pre-existing warnings only), and build pass. The standalone orchestrator suite remains at the established unrelated three-failure baseline with 4,721/4,724 passing; all three CLI failures reproduce outside the runtime-adapter diff.
- Exact-head round 36 reproduced three actionable behavior findings RED and passes 141/141 focused adapter, route, and redaction tests GREEN; the fourth schema finding was already satisfied and its proposed regression passed before implementation. Package/root typecheck, lint (zero errors; pre-existing warnings only), and build pass. The standalone orchestrator suite remains at the same unrelated three-failure baseline with 4,723/4,726 passing.
- Exact-head round 37 reproduced all five findings RED and passes 145/145 focused adapter, route, and redaction tests GREEN. Package/root typecheck, lint (zero errors; pre-existing warnings only), and build pass. The standalone orchestrator suite remains at the same unrelated three-failure baseline with 4,727/4,730 passing.
- Exact-head round 38 inherited all three findings with recorded RED evidence. Independent recovery exposed two incomplete composite changes (direct-adapter UNC redaction and over-broad initial error retry), corrected them, and passes 149/149 focused adapter, route, and redaction tests GREEN. Package/root typecheck, lint (zero errors; pre-existing warnings only), and build pass after rebasing onto current `origin/main`; the full orchestrator suite remains at the established unrelated three-failure baseline with 4,731/4,734 passing.
