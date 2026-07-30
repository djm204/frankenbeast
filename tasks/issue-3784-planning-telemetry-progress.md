# Issue #3784 — Planning Telemetry Best-Effort Progress

- [x] Fetch `origin/main` and verify the isolated branch starts at the exact current head.
- [x] Read issue #3784, the late Codex finding on merged PR #3744, affected adapter/execution paths, and shared issue lessons.
- [x] Add focused adapter regressions proving throwing completion/failure lifecycle hooks do not reject `recordTrace` and generic traces remain recorded.
- [x] Run the focused test before implementation and capture the expected RED failure.
- [x] Add the minimal best-effort boundary at the planning lifecycle hook seam.
- [x] Run focused tests and relevant orchestrator/repository lint, typecheck, build, and test gates.
- [x] Self-review the diff and append a concise reusable lesson.
- [ ] Commit with the required identity and a Conventional Commit, push, and open one PR with `Closes #3784`.
- [ ] Verify local, remote, and PR head equality; drive exact-head CI and GitHub Codex review to clean with zero unresolved threads.
- [ ] Squash-merge only after immutable-head gates pass and verify issue closure.

## Revalidation evidence

- Fresh `origin/main` and local `HEAD`: `ffc3b2c37c21468cb654a569bc18c4ac334bacad`.
- Issue: https://github.com/djm204/frankenbeast/issues/3784 remains open.
- Late report: https://github.com/djm204/frankenbeast/pull/3744#discussion_r3647204080 identifies `SqliteBrainMemoryAdapter.recordTrace()` lifecycle hooks escaping before the generic episodic trace.
- Current affected path: `packages/franken-orchestrator/src/adapters/brain-memory-adapter.ts:31-52` still invokes `recordStepCompleted` / `recordStepFailed` without a caller-side boundary.
- Execution impact: `packages/franken-orchestrator/src/phases/execution.ts:282-299` converts a successful task to failure when `memory.recordTrace()` rejects.
- Expected behavior: optional lifecycle telemetry may fail, but `recordTrace()` resolves and the established generic success/failure trace is still persisted.

## Verification evidence

- RED: `npm run test --workspace @franken/orchestrator -- tests/unit/adapters/brain-memory-adapter.test.ts` failed both regressions because completion/failure hook exceptions rejected `recordTrace()`.
- GREEN: the same focused command passes 2/2 tests after the caller-side boundary.
- Execution coverage: adapter regression plus `tests/unit/phases/execution.test.ts` passes 84/84 tests; three relevant consolidated-dependency integration cases pass.
- `npm run lint --workspace @franken/orchestrator`, `npm run typecheck --workspace @franken/orchestrator`, root `npm run lint`, root `npm run typecheck`, and root `npm run build` pass (lint retains existing warnings only).
- Root `npm run test` reached 5001 passing orchestrator tests but reported two unrelated parallel-suite failures in CLI availability and Codex initialization deadline tests; each exact failing test passed immediately in isolation.
