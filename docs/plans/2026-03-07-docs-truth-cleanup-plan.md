# Docs Truth Cleanup Plan

> Purpose: prepare a documentation cleanup patch to apply after the current in-flight work finishes.
>
> Standard: update docs to match the repo as it exists now. Do not preserve aspirational wording unless it is clearly labeled as planned or not yet wired.

## Cleanup Rules

1. Prefer "implemented in code" over "works end-to-end" unless this repo has a current test that proves it.
2. Do not document flags, commands, or flows that are no longer present in code.
3. If a feature is partial, say what is real, what is stubbed, and what the user should expect.
4. If a document is architectural or forward-looking, split it into:
   - current behavior
   - planned extensions or gaps
5. Treat old progress notes as historical, but do not let them contradict current usage docs.

## Current Truth Baseline

This is the baseline the cleanup patch should document.

### Repo Shape

- The workspace contains 11 package directories: 8 module directories plus `franken-types`, `franken-mcp`, and `franken-orchestrator`.
- In the current git index, those package directories are tracked as gitlinks/submodule entries, but `.gitmodules` is missing. Docs should avoid confident claims like "single monorepo" or "each package in its own repository" until that is clarified.

### Root Tooling

- Root `npm run build` builds 10 directories and currently skips `franken-mcp`.
- Root `npm run test:all` also skips `franken-mcp`.
- `franken-planner` and `franken-observer` both build with `tsup`.
- Root `npm run test` is a root Vitest run, not "all tests."

### CLI Surface

- The current CLI is subcommand-based:
  - `frankenbeast`
  - `frankenbeast interview`
  - `frankenbeast plan --design-doc <path>`
  - `frankenbeast run`
- Supported flags are:
  - `--base-dir`
  - `--base-branch`
  - `--budget`
  - `--provider`
  - `--design-doc`
  - `--plan-dir`
  - `--config`
  - `--no-pr`
  - `--verbose`
  - `--reset`
  - `--resume`
  - `--help`
- The CLI does not support:
  - `--project-id`
  - `--model`
  - `--dry-run`

### CLI Wiring

- Real in CLI path:
  - `CliLlmAdapter`
  - `CliObserverBridge`
  - `CliSkillExecutor`
  - `RalphLoop`
  - `GitBranchIsolator`
  - `FileCheckpointStore`
- Still stubbed in CLI dependency factory:
  - firewall
  - skills registry
  - memory
  - planner port
  - critique
  - governor
  - heartbeat

### Checkpoint and Resume

- Checkpoint-based task skipping is implemented in execution.
- Dirty-file recovery via checkpoint commit metadata is implemented in execution.
- The `--resume` flag is parsed but is not currently wired into `run.ts` or session construction. Docs should not imply that `--resume` enables behavior that does not already happen implicitly from checkpoint files.

### PR Creation

- `PrCreator` exists and is wired from CLI deps unless `--no-pr` is set.
- Current limitation: CLI dependency factory hardcodes PR target branch to `main` instead of the resolved `--base-branch`.
- Docs should describe PR creation as conditional and note the base-branch limitation if they mention it.

### Architecture Boundary

- The orchestrator is not purely "ports only" anymore for the CLI path.
- It has a concrete package dependency on `@frankenbeast/observer` for `CliObserverBridge`.
- Docs should say the main BeastLoop contracts remain port-oriented, but the CLI integration path imports concrete observer classes.

## File-by-File Cleanup Scope

### `docs/RAMP_UP.md`

Keep this as the short source of truth for repo onboarding.

Required edits:

- Keep the package inventory, but soften the repo-shape claim.
- Replace the CLI section with the real subcommand/flag surface.
- State that CLI dependency wiring is mixed and list all stubbed modules, including skills.
- Keep the note that `PrCreator` targets `main`.
- Correct the build section:
  - `npm run build` does not build `franken-mcp`
  - `npm run test` is root Vitest only
  - `franken-observer` also uses `tsup`
- Do not describe `--resume` as a working explicit control path.

### `franken-orchestrator/docs/RAMP_UP.md`

This doc is the most stale and should be brought back to reality.

Required edits:

- Replace the old CLI invocation block entirely.
- Remove `--project-id`, `--model`, `--dry-run`, and `--resume <snapshot-path>`.
- Document the current subcommands and flags exactly.
- Replace "Full execution currently requires concrete module implementations; `--dry-run` and `--resume` work" with a truthful partial-wiring note.
- Replace "CLI `--resume` currently only displays snapshot info" with the actual behavior:
  - checkpoint files can skip completed tasks
  - `--resume` is parsed but not wired as a distinct resume control path
- Fix the `executeTask()` gotcha: it is not stub-level overall; non-CLI execution falls back to `skills.execute()`, while CLI tasks use `CliSkillExecutor`.

### `docs/guides/quickstart.md`

This should become a minimal, truthful getting-started guide.

Required edits:

- Replace the broken `build:all` command with `npm run build`.
- Remove the old `--project-id --dry-run` example.
- Add a current CLI example, for example:
  - `frankenbeast interview`
  - `frankenbeast plan --design-doc docs/plans/example.md`
  - `frankenbeast run --plan-dir .frankenbeast/plans`
- Do not promise that Docker services are required for all local usage unless the specific flow depends on them.
- Keep ChromaDB/Grafana/Tempo as optional support services unless a verified setup path proves they are mandatory for the documented flow.

### `README.md`

This should stay high-level but must stop contradicting the actual CLI.

Required edits:

- Remove obsolete CLI examples using `--project-id` and `--dry-run`.
- Align the CLI usage section with the current subcommand parser.
- Soften any claim that all modules are fully wired into one working pipeline.
- If the README mentions closure injecting Heartbeat improvements back into planning, qualify that as architectural intent unless there is a current verified flow proving it.
- Avoid over-claiming MCP execution in the main BeastLoop description unless the current orchestrator wiring actually routes execution through `franken-mcp`.

### `docs/PROGRESS.md`

This is historical, but some entries now mislead readers who use it as current status.

Required edits:

- Keep historical PR notes, but add a short disclaimer near the top:
  - this is a historical progress log
  - current usage and known limitations live in `docs/RAMP_UP.md`
- Fix obvious current-state contradictions in later sections where they present current CLI behavior:
  - remove `--dry-run outputs config`
  - avoid saying all CLI gaps are closed when `--resume` and base-branch PR targeting are still incomplete
- If test counts remain, label them as "last recorded counts" unless re-verified.

### `docs/cli-gap-analysis.md`

This doc is currently too optimistic for current code.

Required edits:

- Reopen or relabel the explicit resume gap.
- Add a new gap for PR target branch wiring.
- Distinguish:
  - "checkpoint recovery exists"
  - "explicit `--resume` behavior is not wired"
- Remove or soften "all three input modes now work end-to-end" unless there is a current automated test proving that exact claim under the official CLI.

### `docs/ARCHITECTURE.md`

This doc is allowed to be more ambitious, but it needs honest boundaries.

Required edits:

- Add a short note near the top:
  - diagrams include target architecture
  - not every depicted integration is wired in the current local CLI path
- Mark the current CLI path separately from the target full BeastLoop path.
- Correct the PR creation note to reflect the current `main` hardcode in CLI dep wiring.
- Correct the checkpoint note if it implies `--resume` is fully wired.
- Avoid implying live MCP execution in the orchestrator unless that path is wired now.

## Ambitious Docs Gap Register

These are the places where the docs describe more than the code currently guarantees.

### Gap A: Explicit Resume Flow

Docs currently imply:

- `frankenbeast run --resume` is a meaningful explicit resume operation.

Current reality:

- Execution can skip checkpointed tasks if checkpoint files exist.
- `--resume` itself is parsed but not used to change behavior.

Implementation needed before ambitious wording is valid:

1. Thread `resume` through `run.ts` into `Session`.
2. Define expected semantics:
   - fail without checkpoint?
   - require run subcommand?
   - restore plan/session metadata or only execution state?
3. Add tests proving explicit `--resume` behavior.

### Gap B: PR Targets Resolved Base Branch

Docs currently imply:

- PR creation targets `--base-branch`.

Current reality:

- CLI dep factory constructs `PrCreator` with `targetBranch: 'main'`.

Implementation needed:

1. Pass resolved `baseBranch` into `PrCreator`.
2. Add a unit test around CLI dep creation.
3. Update docs only after that test passes.

### Gap C: Full CLI End-to-End Wiring Across Modules

Docs currently imply:

- the CLI is a fully wired BeastLoop over real firewall, memory, planner, critique, governor, heartbeat, skills, observer, and MCP.

Current reality:

- observer and CLI execution stack are real
- several module deps are still stubs in the CLI path

Implementation needed:

1. Replace stubs in `src/cli/dep-factory.ts` one module at a time.
2. Add integration tests for each real dependency path.
3. Add one authoritative "what is wired" matrix to the docs.

### Gap D: MCP in Active Orchestrator Execution

Docs currently imply:

- orchestrator execution actively routes external tool execution through `franken-mcp`.

Current reality:

- the architecture docs include MCP prominently
- current local CLI wiring does not present an obviously wired real MCP execution path in the dependency factory

Implementation needed:

1. Wire concrete `IMcpModule` creation into CLI deps.
2. Prove tool discovery and tool execution in integration tests.
3. Only then describe MCP as part of the working execution path instead of the target architecture.

### Gap E: Heartbeat-Driven Self-Improvement Loop

Docs currently imply:

- heartbeat findings feed new tasks back into planning as an active working loop.

Current reality:

- closure can pulse heartbeat, but active self-improvement reinjection should not be described as a verified current behavior unless tested end-to-end.

Implementation needed:

1. Define the reinjection contract in orchestrator flow.
2. Add tests showing heartbeat-generated tasks alter subsequent planning/execution.
3. Update architecture and README after proof exists.

### Gap F: Local Dev Stack Requirements

Docs currently imply:

- ChromaDB, Grafana, and Tempo are part of the normal required setup.

Current reality:

- those services exist in compose, but not every documented flow clearly requires all of them

Implementation needed:

1. Decide which flows truly require each service.
2. Split "required for core usage" from "optional observability/memory services."
3. Update quickstart to match the narrowest truthful requirement.

## Suggested Patch Order

Apply the cleanup patch in this order:

1. `docs/RAMP_UP.md`
2. `franken-orchestrator/docs/RAMP_UP.md`
3. `docs/guides/quickstart.md`
4. `README.md`
5. `docs/cli-gap-analysis.md`
6. `docs/ARCHITECTURE.md`
7. `docs/PROGRESS.md`

Reason:

- fix the shortest source-of-truth docs first
- then align the user entrypoints
- then fix historical and ambitious docs

## Definition of Done

The cleanup patch is done when:

- no user-facing doc mentions `--dry-run`, `--project-id`, or `--model` for `frankenbeast`
- no doc says `--resume` works unless it clearly explains the current limitation
- no doc says the CLI is fully wired when stubs remain
- no doc says PR creation targets `--base-branch` until code does
- quickstart commands match real package scripts
- at least one doc clearly separates:
  - current implemented behavior
  - target architecture

## Optional Follow-Up

After the cleanup patch lands, add a single machine-checkable docs contract test suite for:

- CLI flags and usage text
- root script names
- known limitations text
- the list of stubbed CLI dependencies

That will reduce drift the next time the CLI changes.
