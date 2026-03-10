# Frankenbeast Init Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a UX-friendly `frankenbeast init` workflow that writes one canonical top-level config file, lets operators toggle supported modules and comms transports, persists resumable init state, and feeds validated config into runtime services at launch.

**Architecture:** Build a shared init engine inside `franken-orchestrator`, exposed through a new CLI `init` subcommand. The init engine owns interactive wizard flow, config persistence, resumable state, verify/repair logic, and transport-specific branching for `comms`, while runtime services continue to consume one canonical `.frankenbeast/config.json` through existing config loading and derived service projections.

**Tech Stack:** TypeScript, Zod, Node.js CLI, Vitest

---

## Current Repo State Snapshot (Verified 2026-03-10)

This implementation plan replaces stale assumptions in the earlier init plan and is grounded in the current codebase.

### Already present

- The canonical project-scoped config path already exists at `.frankenbeast/config.json`, resolved via [project-root.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/cli/project-root.ts).
- Config loading already flows through [config-loader.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/cli/config-loader.ts), which merges file, env, and CLI layers into [orchestrator-config.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/config/orchestrator-config.ts).
- Runtime config already includes top-level sections for `providers`, `network`, `chat`, `dashboard`, and `comms`.
- Network-managed services already derive runtime config from the canonical orchestrator config through [network-registry.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/network/network-registry.ts).
- `comms` service startup is wired only for `slack` and `discord` today via [comms-gateway-service.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/network/services/comms-gateway-service.ts), even though `franken-comms` contains additional `telegram` and `whatsapp` adapters.

### Missing

- There is no `init` subcommand in [args.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/cli/args.ts) or [run.ts](/home/pfk/dev/frankenbeast/.worktrees/feat-init-config-wizard/packages/franken-orchestrator/src/cli/run.ts).
- There is no shared init engine, wizard, verify mode, repair mode, or resumable init-state persistence.
- There is no init-specific registry describing supported modules or supported comms transports.
- There is no operator-friendly first-run flow that writes `.frankenbeast/config.json` for the current platform surface.

### Scope guard for v1

The wizard must expose only config that the runtime can consume today:

- provider/runtime defaults
- `chat`
- `dashboard`
- `comms`
- `comms` child transport setup only for runtime-supported transports: `slack` and `discord`

The following areas are not yet landed and should be documented as future extension points, not surfaced as live config sections:

- dashboard-managed agent profiles
- file-store integrations
- productivity integrations
- additional comms transport setup through orchestrator runtime (`telegram`, `whatsapp`)

---

### Task 1: Save the approved design and rewrite the stale init plan

**Files:**
- Create: `docs/plans/2026-03-10-init-config-wizard-design.md`
- Modify: `docs/plans/2026-03-09-init-workflow-implementation-plan.md`

**Step 1: Write the design doc from the approved direction**

Capture:

- canonical config at `.frankenbeast/config.json`
- resumable init state at `.frankenbeast/init-state.json`
- shared init engine inside `franken-orchestrator`
- CLI-first wizard with `init`, `init --verify`, and `init --repair`
- module toggles for `chat`, `dashboard`, `comms`
- comms branching into supported transports only
- future extension points documented but not implemented

**Step 2: Rewrite this implementation plan around current repo reality**

Preserve the intent of the original plan, but replace stale assumptions with:

- existing config loader and orchestrator schema
- existing network runtime fan-out
- current runtime support limitations for comms transports
- an execution order that matches TDD and the approved v1 scope

**Step 3: Commit the planning update**

```bash
git add docs/plans/2026-03-10-init-config-wizard-design.md docs/plans/2026-03-09-init-workflow-implementation-plan.md
git commit -m "docs: refresh init workflow design and plan"
```

### Task 2: Add CLI surface for the init workflow

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Write the failing CLI argument tests**

Add tests covering:

- `init` is accepted as a valid subcommand
- `init --verify`
- `init --repair`
- `init --non-interactive`
- help text lists the new init command and flags
- `run.ts` dispatches `init` without constructing a `Session`

**Step 2: Run focused tests and verify red**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts
```

Expected: FAIL because `init` does not exist yet

**Step 3: Implement the minimal CLI surface**

Add:

- `init` to the CLI subcommand union and usage text
- init-specific flags to parsed args
- dispatch in `run.ts` to a dedicated init handler

Do not implement full init logic in `run.ts`; it should delegate.

**Step 4: Re-run the focused tests and verify green**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/cli/args.test.ts packages/franken-orchestrator/tests/unit/cli/run.test.ts
git commit -m "feat: add init cli surface"
```

### Task 3: Add init state, config persistence helpers, and registries

**Files:**
- Create: `packages/franken-orchestrator/src/init/init-types.ts`
- Create: `packages/franken-orchestrator/src/init/init-state-store.ts`
- Create: `packages/franken-orchestrator/src/init/module-registry.ts`
- Create: `packages/franken-orchestrator/src/init/comms-transport-registry.ts`
- Create: `packages/franken-orchestrator/tests/unit/init/init-state-store.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/init/module-registry.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/init/comms-transport-registry.test.ts`

**Step 1: Write failing tests for init state persistence**

Cover:

- saves `.frankenbeast/init-state.json`
- reloads prior state
- missing file returns a clean initial state
- records selected modules and completed steps

**Step 2: Write failing tests for module and transport registries**

Cover:

- module registry includes `chat`, `dashboard`, `comms`
- comms registry returns only runtime-supported transports
- current runtime-supported comms transports are `slack` and `discord`
- future transport definitions can exist without being reported as supported

**Step 3: Run focused tests and verify red**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/init/init-state-store.test.ts tests/unit/init/module-registry.test.ts tests/unit/init/comms-transport-registry.test.ts
```

Expected: FAIL because files do not exist yet

**Step 4: Implement the minimal state store and registries**

Requirements:

- define a typed init-state model
- persist/load JSON from `.frankenbeast/init-state.json`
- module registry should describe wizardable modules and whether they are supported
- comms transport registry should source support from orchestrator runtime, not just `franken-comms` package presence

**Step 5: Re-run focused tests and verify green**

Run the same command as Step 3.

Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/init packages/franken-orchestrator/tests/unit/init
git commit -m "feat: add init state and registries"
```

### Task 4: Build the shared init engine and interactive wizard

**Files:**
- Create: `packages/franken-orchestrator/src/init/init-engine.ts`
- Create: `packages/franken-orchestrator/src/init/init-wizard.ts`
- Create: `packages/franken-orchestrator/src/cli/init-command.ts`
- Create: `packages/franken-orchestrator/tests/unit/init/init-engine.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/cli/init-command.test.ts`

**Step 1: Write failing tests for canonical config generation**

Cover:

- enabled modules set the expected `enabled` flags in top-level config
- disabled modules do not require extra answers
- comms branching only asks for selected transports
- selected `slack` answers populate `comms.slack`
- selected `discord` answers populate `comms.discord`
- wizard resumes from saved init state instead of restarting from scratch

**Step 2: Run focused tests and verify red**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/init/init-engine.test.ts tests/unit/cli/init-command.test.ts
```

Expected: FAIL because the engine and handler do not exist yet

**Step 3: Implement the minimal shared engine**

Requirements:

- use one canonical config output shape: `OrchestratorConfig`
- persist config to `.frankenbeast/config.json`
- persist progress to `.frankenbeast/init-state.json`
- support interactive prompts through injected IO
- branch comms setup only when `comms` is enabled
- branch transport setup only for selected supported transports
- preload prior answers when rerun

Keep the engine pure where possible; filesystem writes should live behind small helpers.

**Step 4: Re-run focused tests and verify green**

Run the same command as Step 2.

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/init packages/franken-orchestrator/src/cli/init-command.ts packages/franken-orchestrator/tests/unit/init/init-engine.test.ts packages/franken-orchestrator/tests/unit/cli/init-command.test.ts
git commit -m "feat: add init wizard engine"
```

### Task 5: Add verify and repair modes

**Files:**
- Create: `packages/franken-orchestrator/src/init/init-verify.ts`
- Modify: `packages/franken-orchestrator/src/cli/init-command.ts`
- Create: `packages/franken-orchestrator/tests/unit/init/init-verify.test.ts`

**Step 1: Write failing tests for verify and repair**

Cover:

- `--verify` reports missing config or incomplete init state clearly
- `--verify` checks only enabled modules and enabled comms transports
- `--repair` re-enters only missing or failed sections
- `--repair` preserves already valid config answers

**Step 2: Run focused tests and verify red**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/init/init-verify.test.ts tests/unit/cli/init-command.test.ts
```

Expected: FAIL because verify/repair logic is missing

**Step 3: Implement the minimal verify/repair layer**

Requirements:

- verify the existence and validity of config/init-state files
- verify enabled module requirements only
- verify enabled comms transport requirements only
- return actionable remediation messages
- let repair delegate back into the init engine with scoped missing steps

**Step 4: Re-run focused tests and verify green**

Run the same command as Step 2.

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/init/init-verify.ts packages/franken-orchestrator/src/cli/init-command.ts packages/franken-orchestrator/tests/unit/init/init-verify.test.ts
git commit -m "feat: add init verify and repair flows"
```

### Task 6: Wire runtime projections and document future extension points

**Files:**
- Modify: `packages/franken-orchestrator/src/network/services/comms-gateway-service.ts`
- Modify: `packages/franken-orchestrator/src/network/network-config.ts`
- Modify: `packages/franken-orchestrator/src/network/network-config-paths.ts`
- Modify: `docs/2026-03-10-main-functionality-gap-report.md` (only if needed for consistency)
- Test: `packages/franken-orchestrator/tests/unit/network/network-config.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-registry.test.ts`

**Step 1: Write failing regression tests for runtime consumption**

Cover:

- runtime still derives service config from the single canonical config file
- comms runtime only reports currently supported transports
- toggled-off modules remain disabled at runtime

**Step 2: Run focused tests and verify red if behavior needs adjustment**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-config.test.ts tests/unit/network/network-registry.test.ts
```

Expected: FAIL only if runtime projection changes are required

**Step 3: Implement any required runtime alignment**

Use the smallest change that preserves:

- one top-level config file
- no module-owned persisted config files
- accurate reporting of supported comms transports

Do not add `telegram` or `whatsapp` to orchestrator runtime unless the service layer can actually start and validate them.

**Step 4: Re-run focused tests and verify green**

Run the same command as Step 2.

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network packages/franken-orchestrator/tests/unit/network
git commit -m "refactor: align runtime with init config wizard"
```

### Task 7: Full verification and PR

**Files:**
- Verify only

**Step 1: Run package-focused init verification**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/unit/cli/init-command.test.ts tests/unit/init/init-state-store.test.ts tests/unit/init/module-registry.test.ts tests/unit/init/comms-transport-registry.test.ts tests/unit/init/init-engine.test.ts tests/unit/init/init-verify.test.ts tests/unit/network/network-config.test.ts tests/unit/network/network-registry.test.ts
```

Expected: PASS

**Step 2: Run full repo verification**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS

**Step 3: Push and open PR**

```bash
git push
gh pr create --base main --head feat/init-config-wizard --title "feat: add init config wizard" --body "..."
```
