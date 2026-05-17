# Beast Mode Hardening

- [x] Create an isolated worktree from `main` for this implementation.
- [x] Rebuild task tracking in the clean worktree and record the worktree-isolation lesson.
- [x] Baseline the clean `packages/franken-orchestrator` tests that cover CLI config and execution wiring.
- [x] Add failing tests for config truthfulness and explicit `run --resume` semantics.
- [x] Implement the minimal config propagation and resume behavior to satisfy those tests.
- [x] Add failing tests for required-path dependency hardening and remove permissive fallback success behavior.
- [x] Implement hard-fail dependency assembly semantics and real required-path wiring.
- [x] Add or repair focused proof tests for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`. (`skill`+`security` added; `run`/`issues`/`chat`/`chat-server`/`network` verified green; `beasts` is a documented pre-existing failure scoped out — see matrix.)
- [x] Write any ADRs needed to document new runtime contracts or hard-fail rules. (ADR-033.)
- [x] Re-run the focused beast verification matrix and record results here.

## Review

- 2026-04-26: First hardening batch green in `packages/franken-orchestrator` via `npm test -- --run tests/unit/cli/run.test.ts tests/unit/cli/session.test.ts tests/unit/beast-loop.test.ts tests/integration/cli/dep-factory-wiring.test.ts`.
- 2026-05-16: Resumed from interruption (steps 10–12). Evidence (in `packages/franken-orchestrator`):
  - Core hardening set: **74/74 pass** (`run.test.ts`, `session.test.ts`, `beast-loop.test.ts`, `dep-factory-wiring.test.ts`).
  - Release-gate command-family set (7 families: `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`): **6 files passed, 1 skipped, 0 failed** — 15 tests passed, 1 skipped.
  - `beasts`: 2 tests fail (`agent-routes.test.ts:211`, `:465`). **Pre-existing on `main` (`100dd1f`)**, reproduced with this branch's `beast-loop.ts`/`dep-factory.ts` reverted to `main`; unrelated to the run/resume/dep-factory hardening contract. Root cause: `agent-routes` `createRun` dispatch omits `configSchema`-required fields. Scoped out and documented in `docs/guides/beast-verification-matrix.md` for a separate `beasts`-surface task.
  - Scope statement: this branch hardens the live `run`/resume/dep-factory contract only; it does not claim the `beasts` surface is fixed.
