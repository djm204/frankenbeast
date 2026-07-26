# Smart Swarm #3817 — Ollama Runtime Adapter Progress

- [x] Confirm live issue #3817 requirements and labels from GitHub.
- [x] Verify isolated worktree, branch, clean state, Git identity, and exact base `7b98df2486da583dedb1971b9348a7c0290742a6`.
- [x] Rebase onto upstream PR #3821's updated exact head `9b6c62305360bd5f3aa990a6787b9a258a6db082` before publication.
- [x] Inspect provider-neutral runtime schemas, registry/default wiring, exports, Hermes reference adapter, and focused tests.
- [x] RED→GREEN: register/export an unavailable-by-default Ollama adapter without assuming localhost.
- [x] RED→GREEN: discover explicit local/remote/cloud-compatible endpoint configuration while rejecting unsafe credential-bearing or non-loopback plaintext URLs.
- [x] RED→GREEN: read bounded health, version, installed-model, and loaded-model data from a controlled HTTP server and expose only honest normalized metadata.
- [x] RED→GREEN: keep task/agent/run/event/blocker/approval sections unsupported when Ollama exposes no canonical upstream concepts; do not synthesize activity.
- [x] RED→GREEN: enforce bounded timeout, cancellation propagation, response-size limits, request rate limiting, failure isolation, credential-reference resolution, and redacted diagnostics.
- [x] Run focused adapter/contract/route tests (34/34 passing after the upstream cursor/stream contract updates).
- [x] Run package and root tests, lint, typecheck, build, `git diff --check`, and self-review; focused tests, lint, typecheck, build, and diff checks pass, while full package/root tests retain unrelated timeout/environment baseline failures.
- [x] Commit with Conventional Commits using David Mendez <me@davidmendez.dev>.
- [x] Push `feat/ollama-runtime-adapter-3817` and open PR #3834 with `Closes #3817`.
- [ ] Drive real GitHub `@codex review` to exact-current-head clean with zero unresolved Codex threads and green CI.
- [ ] Post durable evidence to root card `t_25558345` and complete/block this card accurately without merging.

## Requirement evidence

Live GitHub issue https://github.com/djm204/frankenbeast/issues/3817 is open and requires an Ollama runtime adapter behind #3812's normalized contract. It explicitly requires configured local and Ollama Cloud-compatible endpoints, honest capability declarations, bounded/cancellable/rate-limited resilient HTTP polling, trust/TLS/secret/redaction handling, controlled fake-server integration tests, and no synthetic tasks, agents, or activity when upstream observability is missing.

The canonical worktree was clean on `feat/ollama-runtime-adapter-3817` at `7b98df2486da583dedb1971b9348a7c0290742a6`; Git identity was `David Mendez <me@davidmendez.dev>`. During recovery, live PR #3821 advanced twice; the staged #3817 implementation was ultimately rebased/reset onto exact head `9b6c62305360bd5f3aa990a6787b9a258a6db082` before publication and adapted to its synchronous cursor-validation and stream-metadata contracts.

## Verification evidence

- `npx vitest run tests/unit/runtime/ollama-runtime-adapter.test.ts tests/unit/runtime/runtime-contract.test.ts tests/unit/http/runtime-routes.test.ts tests/unit/http/runtime-route-mounting.test.ts --testTimeout=20000`: 34/34 passed on the final publication base.
- `npm run lint`: passed (pre-existing warnings only).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Package `npm test`: 4,632/4,637 passed; five unrelated load/environment failures (two 5s timeouts, one network-health host-state mismatch, and two CLI mock leakage failures).
- Root `npm test`: stopped on an unrelated `@franken/brain` 20s recall timeout; affected Ollama-focused tests passed independently.
- `git diff --check`: passed.
