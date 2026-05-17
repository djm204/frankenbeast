# Beast Verification Matrix

This matrix is the release gate for the live `franken-orchestrator` beast surface. Each entry maps to a shipped command family or a required runtime contract that the surface depends on.

## Focused Proof Set

### Core runtime hardening

- Config propagation, default-provider truthfulness, explicit cold-run versus `--resume`, runtime limits, and fail-closed dep assembly:

```bash
cd packages/franken-orchestrator
npm test -- --run \
  tests/unit/cli/run.test.ts \
  tests/unit/cli/session.test.ts \
  tests/unit/beast-loop.test.ts \
  tests/integration/cli/dep-factory-wiring.test.ts
```

### Live command families

- `run`: `tests/e2e/chunk-pipeline.test.ts`
- `issues`: `tests/integration/issues/issues-e2e.test.ts`
- `chat`: `tests/e2e/chat/chat-e2e.test.ts`
- `chat-server`: `tests/integration/chat/chat-server.test.ts`
- `skill`: `tests/integration/cli/skill-command.test.ts`
- `security`: `tests/integration/cli/security-command.test.ts`
- `network`: `tests/integration/network/network-cli.test.ts`
- `beasts`: `tests/integration/beasts/agent-routes.test.ts`

Run (full release-gate set):

```bash
cd packages/franken-orchestrator
npm test -- --run \
  tests/e2e/chunk-pipeline.test.ts \
  tests/integration/issues/issues-e2e.test.ts \
  tests/e2e/chat/chat-e2e.test.ts \
  tests/integration/chat/chat-server.test.ts \
  tests/integration/cli/skill-command.test.ts \
  tests/integration/cli/security-command.test.ts \
  tests/integration/network/network-cli.test.ts \
  tests/integration/beasts/agent-routes.test.ts
```

## Interpretation

- A failing command-family proof means that surface is not release-ready, even if lower-level unit tests still pass.
- The core runtime hardening set must stay green alongside the command-family set.
- New beast-surface flags or subcommands are not considered complete until they are added to this matrix with a focused proof test.
- All eight command families plus the core hardening set are green as of this branch's base (`origin/main` @ `610a0ea`); the full set above must stay green to release.
- If a family must ever be temporarily excluded, add a "Known Pre-Existing Failure" section recording evidence, root cause, and a tracking decision; an undocumented regression in any family blocks release.
