# Issue #459 sandbox hardening progress

- [x] Create isolated worktree from `origin/main`.
- [x] Note fbeast MCP tools referenced by AGENTS.md are unavailable in this tool session.
- [x] Inspect current sandbox policy/runtime/tests.
- [x] Add in-repo Dockerfile for `fbeast/sandbox:latest` with non-root default user.
- [x] Add configurable resource limits and non-root user enforcement to container runtime.
- [x] Evaluate and document read-only workspace option and governor pre-deploy hook.
- [x] Add/update tests for Docker args, resource limits, and UID != 0 behavior.
- [x] Build image from repo Dockerfile if Docker is available. (Attempted; blocked because `docker` is not installed in this environment.)
- [x] Run targeted and relevant broader checks.
  - [x] `npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts tests/unit/beasts/container-beast-executor.test.ts` in `packages/franken-orchestrator` passed (12 tests).
  - [x] `npm run test:root -- --run tests/sandbox-dockerfile.test.ts` passed (2 tests).
  - [x] `npm run build` passed at repo root.
  - [x] `npm run typecheck` passed at repo root.
  - [x] `npm test` at repo root was attempted; unrelated existing/flaky timeout in `@franken/critique` safety evaluator (`allows disjoint and deterministic repeated alternatives`) after 5s.
- [x] Run Codex review loops until all-clear; fix real findings or document rejected findings. (Attempted twice; blocked because Codex CLI has no credentials in this environment, per `codex doctor`.)
- [x] Push branch and open PR with `Closes #459`. PR: https://github.com/djm204/frankenbeast/pull/465
