# Beast Mode Hardening

- [x] Create an isolated worktree from `main` for this implementation.
- [x] Rebuild task tracking in the clean worktree and record the worktree-isolation lesson.
- [x] Baseline the clean `packages/franken-orchestrator` tests that cover CLI config and execution wiring.
- [x] Add failing tests for config truthfulness and explicit `run --resume` semantics.
- [x] Implement the minimal config propagation and resume behavior to satisfy those tests.
- [x] Add failing tests for required-path dependency hardening and remove permissive fallback success behavior.
- [x] Implement hard-fail dependency assembly semantics and real required-path wiring.
- [ ] Add or repair focused proof tests for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`.
- [ ] Write any ADRs needed to document new runtime contracts or hard-fail rules.
- [ ] Re-run the focused beast verification matrix and record results here.

## Review

- 2026-04-26: First hardening batch green in `packages/franken-orchestrator` via `npm test -- --run tests/unit/cli/run.test.ts tests/unit/cli/session.test.ts tests/unit/beast-loop.test.ts tests/integration/cli/dep-factory-wiring.test.ts`.
