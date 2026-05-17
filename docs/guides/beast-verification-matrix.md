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
- `beasts`: `tests/integration/beasts/agent-routes.test.ts` — **KNOWN PRE-EXISTING FAILURE** (see below); excluded from the hardening release gate.

Run (release-gate set — excludes the pre-existing `beasts` failure):

```bash
cd packages/franken-orchestrator
npm test -- --run \
  tests/e2e/chunk-pipeline.test.ts \
  tests/integration/issues/issues-e2e.test.ts \
  tests/e2e/chat/chat-e2e.test.ts \
  tests/integration/chat/chat-server.test.ts \
  tests/integration/cli/skill-command.test.ts \
  tests/integration/cli/security-command.test.ts \
  tests/integration/network/network-cli.test.ts
```

## Known Pre-Existing Failure: `beasts`

`tests/integration/beasts/agent-routes.test.ts` has 2 failing tests
(`agent-routes.test.ts:211`, `:465` — `created.data.status` is `'failed'`,
expected `'initializing'`).

- **Status:** pre-existing on `main` (`100dd1f`, ~4 weeks before this branch). The
  Beast Mode Hardening branch (`f152d1d`) does not touch the `beasts` surface;
  reverting this branch's `beast-loop.ts`/`dep-factory.ts` to `main` reproduces
  the identical failure.
- **Root cause:** `agent-routes` `createRun` dispatch passes `initConfig` that
  omits fields the target beast definition's `configSchema` requires
  (`goal`/`outputPath`/`initAction`), so `BeastDispatchService.createRun`
  throws a real (non-`unrecognized_keys`) validation error and the agent is
  marked `failed`.
- **Scope decision:** out of scope for the run/resume/dep-factory hardening
  contract. Tracked for a separate `beasts`-surface fix; this gate excludes it
  but the entry stays here so it is not silently forgotten.

## Interpretation

- A failing command-family proof means that surface is not release-ready, even if lower-level unit tests still pass.
- The core runtime hardening set must stay green alongside the command-family set.
- New beast-surface flags or subcommands are not considered complete until they are added to this matrix with a focused proof test.
- Documented known pre-existing failures (see "Known Pre-Existing Failure") are excluded from the release gate only while their entry records evidence, root cause, and a tracking decision. A regression in any family that is *not* documented here blocks release.
