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
- [x] Run focused adapter/contract/route tests (43/43 passing after the final upstream rebase).
- [x] Run package tests plus root lint, typecheck, build, `git diff --check`, and self-review; focused tests, lint, typecheck, build, and diff checks pass, while the package suite retains three unrelated environment/order-dependent baseline failures.
- [x] Commit with Conventional Commits using David Mendez <me@davidmendez.dev>.
- [x] Push `feat/ollama-runtime-adapter-3817` and open PR #3834 with `Closes #3817`.
- [ ] Drive real GitHub `@codex review` to exact-current-head clean with zero unresolved Codex threads and green CI. Two rounds completed before the final upstream rebase; six Ollama findings were fixed and all prior threads were answered/resolved. A fresh exact-head round remains required after publication.
- [x] Post durable evidence to root card `t_25558345` and complete/block this card accurately without merging.

## Requirement evidence

Live GitHub issue https://github.com/djm204/frankenbeast/issues/3817 is open and requires an Ollama runtime adapter behind #3812's normalized contract. It explicitly requires configured local and Ollama Cloud-compatible endpoints, honest capability declarations, bounded/cancellable/rate-limited resilient HTTP polling, trust/TLS/secret/redaction handling, controlled fake-server integration tests, and no synthetic tasks, agents, or activity when upstream observability is missing.

The canonical worktree was clean on `feat/ollama-runtime-adapter-3817` at `7b98df2486da583dedb1971b9348a7c0290742a6`; Git identity was `David Mendez <me@davidmendez.dev>`. During recovery and review, live PR #3821 advanced repeatedly; the #3817 implementation was first rebased onto `4bfd23c168ecc62f3be86a295a53bc9881e55207`, then onto final clean exact head `9d7393fa76f2c00ddbbc2ceb9010d287550eac4e` after #3821 reached green CI, clean Codex, and zero unresolved threads.

## Verification evidence

- `npx vitest run tests/unit/runtime/ollama-runtime-adapter.test.ts tests/unit/runtime/runtime-contract.test.ts tests/unit/http/runtime-routes.test.ts tests/unit/http/runtime-route-mounting.test.ts --testTimeout=20000`: 43/43 passed on the final upstream base.
- `npm run lint`: passed (pre-existing warnings only).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Package `npm test`: 4,660/4,663 passed; three unrelated environment/order-dependent failures (one network-health host-state mismatch and two CLI mock leakage failures).
- `git diff --check`: passed.

## Codex review evidence

- Round 1 fixed default egress-policy forwarding, empty endpoint-ID rejection, and fresh polling after all shared waiters cancel (`6a5002811`, rebased as `36595ea18`).
- Round 2 fixed duplicate endpoint-ID rejection, cancellation of all parallel response bodies on HTTP failure, and validation of successful Ollama API payload schemas (`bbd7001c9`).
- Ollama adapter suite: 21/21 passed after round 2; focused runtime/HTTP set and typecheck passed after the exact-head rebase.
- Every round-1 and round-2 Codex thread on PR #3834 was replied to and resolved; unresolved Codex thread count was verified as zero before this dependency handoff.
- Four inherited round-2 findings were posted to root card `t_25558345`, and the three additional inherited #3812 findings were posted directly to canonical upstream card `t_3828faf1`.
