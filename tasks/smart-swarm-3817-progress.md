# Smart Swarm #3817 — Ollama Runtime Adapter Progress

- [x] Confirm live issue #3817 requirements and labels from GitHub.
- [x] Verify isolated worktree, branch, clean state, Git identity, and exact base `7b98df2486da583dedb1971b9348a7c0290742a6`.
- [x] Rebase onto upstream PR #3821's final clean exact head `9d7393fa76f2c00ddbbc2ceb9010d287550eac4e`.
- [x] Inspect provider-neutral runtime schemas, registry/default wiring, exports, Hermes reference adapter, and focused tests.
- [x] RED→GREEN: register/export an unavailable-by-default Ollama adapter without assuming localhost.
- [x] RED→GREEN: discover explicit local/remote/cloud-compatible endpoint configuration while rejecting unsafe credential-bearing or non-loopback plaintext URLs.
- [x] RED→GREEN: read bounded health, version, installed-model, and loaded-model data from a controlled HTTP server and expose only honest normalized metadata.
- [x] RED→GREEN: keep task/agent/run/event/blocker/approval sections unsupported when Ollama exposes no canonical upstream concepts; do not synthesize activity.
- [x] RED→GREEN: enforce bounded timeout, cancellation propagation, response-size limits, request rate limiting, failure isolation, credential-reference resolution, and redacted diagnostics.
- [x] Run focused adapter/contract/route tests (47/47 passing after final upstream rebase and Codex remediation).
- [x] Run package tests plus root lint, typecheck, build, `git diff --check`, and self-review; focused tests, lint, typecheck, build, and diff checks pass, while the package suite retains three unrelated environment/order-dependent baseline failures.
- [x] Commit with Conventional Commits using David Mendez <me@davidmendez.dev>.
- [x] Push `feat/ollama-runtime-adapter-3817` and open PR #3834 with `Closes #3817`.
- [ ] Drive real GitHub `@codex review` to exact-current-head clean with zero unresolved Codex threads and green CI. Tier-12 round 6 produced three Ollama findings now fixed locally and one inherited #3812 finding routed upstream; push, resolve, and final exact-head review remain.
- [x] Post durable evidence to root card `t_25558345` and complete/block this card accurately without merging.

## Requirement evidence

Live GitHub issue https://github.com/djm204/frankenbeast/issues/3817 is open and requires an Ollama runtime adapter behind #3812's normalized contract. It explicitly requires configured local and Ollama Cloud-compatible endpoints, honest capability declarations, bounded/cancellable/rate-limited resilient HTTP polling, trust/TLS/secret/redaction handling, controlled fake-server integration tests, and no synthetic tasks, agents, or activity when upstream observability is missing.

The canonical worktree was clean on `feat/ollama-runtime-adapter-3817` at `7b98df2486da583dedb1971b9348a7c0290742a6`; Git identity was `David Mendez <me@davidmendez.dev>`. During recovery and review, live PR #3821 advanced repeatedly; the #3817 implementation was first rebased onto `4bfd23c168ecc62f3be86a295a53bc9881e55207`, then onto final clean exact head `9d7393fa76f2c00ddbbc2ceb9010d287550eac4e` after #3821 reached green CI, clean Codex, and zero unresolved threads.

## Verification evidence

- `npx vitest run tests/unit/runtime/ollama-runtime-adapter.test.ts tests/unit/runtime/runtime-contract.test.ts tests/unit/http/runtime-routes.test.ts tests/unit/http/runtime-route-mounting.test.ts --testTimeout=20000`: 47/47 passed after final review remediation.
- `npm run lint`: passed (pre-existing warnings only).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Package `npm test`: 4,660/4,663 passed; three unrelated environment/order-dependent failures (one network-health host-state mismatch and two CLI mock leakage failures).
- `git diff --check`: passed.

## Codex review evidence

- Round 1 fixed default egress-policy forwarding, empty endpoint-ID rejection, and fresh polling after all shared waiters cancel (`6a5002811`, rebased as `36595ea18`).
- Round 2 fixed duplicate endpoint-ID rejection, cancellation of all parallel response bodies on HTTP failure, and validation of successful Ollama API payload schemas (`bbd7001c9`).
- Round 3 fixed live network-policy refresh and cancellation of fulfilled sibling bodies after transport rejection.
- Round 4 produced only inherited #3812 findings, which were routed to the canonical upstream card instead of broadening #3817.
- Round 5 fixed scheme-less `OLLAMA_HOST` normalization and cached health-check timestamps; three more inherited #3812 findings were routed upstream.
- Round 6 found missing managed-chat Ollama environment inheritance, uncancelled sibling bodies after JSON normalization failure, and permissive malformed model-entry handling. Regression tests failed for each behavior before implementation; 72/72 focused tests plus root lint, typecheck, and build pass after the fixes. The inherited Hermes workspace-preservation finding was routed to `t_3828faf1`.
- Ollama adapter suite: 24/24 passed after round 5; the focused runtime/HTTP set is 47/47 and root lint, typecheck, and build pass.
- Every Codex thread through round 5 was replied to and resolved; the next exact-head review requires explicit approval to raise the invocation cap from 5 to 12.
- Four inherited round-2 findings were posted to root card `t_25558345`, and the three additional inherited #3812 findings were posted directly to canonical upstream card `t_3828faf1`.
