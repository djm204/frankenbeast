# Agent Ramp-Up

> Entry point for AI agents working in this repo. The full onboarding doc is
> [RAMP_UP.md](RAMP_UP.md) — read it for package map, Beast Loop phases, CLI
> surface, and runtime layout. This file is the **active-decisions ledger**:
> keep it current after structural changes (workflow rule).

## Orientation in 30 seconds

- 10 npm-workspace packages under `packages/` (see [RAMP_UP.md](RAMP_UP.md) module table).
- Build/test/typecheck via turbo: `npm run build` / `npm test` / `npm run typecheck`; per package `npx turbo run test --filter=<workspace-name>`.
- Runtime state lives under `.fbeast/` (`beast.db`, `plans/`, `.build/`, `audit/`, `state/`) — never commit it.
- Docs claims are audited against code; when you change behavior, update ARCHITECTURE/DATA_FLOW/RAMP_UP in the same PR.

## Active Decisions

Implemented and enforced (verify before relying on legacy docs that say otherwise):

- **ADR-031** — consolidation: no standalone firewall/skills/heartbeat/mcp packages; capabilities live in `franken-orchestrator` and `@fbeast/mcp-suite` (workspace has since grown back to 10 packages).
- **ADR-033 (beast-run-resume)** — fail-closed dep assembly; cold runs clear checkpoints; `--resume` fails fast without one.
- **ADR-033 (hook-failclosed-payload)** — pre-tool hooks forward command text via `FBEAST_TOOL_CONTEXT` and deny on empty/unparseable tool names.
- **ADR-036 (both)** — safety modules fail closed (`FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` is the only opt-out); sandboxed container execution via `ContainerBeastExecutor` (a `ProcessSupervisor` whose spawn spec is rewritten to a docker invocation by `toDockerSpec`).
- **ADR-037** — durable audit + replay capture; phase snapshots require `config.stateDir` (the CLI always sets it).
- **ADR-038** — central MCP governance gate in dispatch.
- **ADR-028** git worktree isolation — implemented for tracked-agent runs (`ProcessBeastExecutor.start()` → `createBeastWorktree()`); ad-hoc/local-CLI runs still share the checkout via branch switching.

Accepted but **not (fully) implemented** — do not describe as live:

- **ADR-027** beast daemon — `beasts-daemon` subcommand exists; follow-up work tracked in [#463](https://github.com/djm204/frankenbeast/issues/463).
- Recovery loop wiring (beast-loop-explained "Loop 4") — tracked in [#496](https://github.com/djm204/frankenbeast/issues/496).
- Parallel/recursive execution strategies — tracked in [#497](https://github.com/djm204/frankenbeast/issues/497).

## Ground rules

- ADRs for any architectural decision → `docs/adr/NNN-name.md`, linked here.
- Progress docs for larger tasks → `tasks/<task>-progress.md`.
- Keep `.gitignore` hygiene per CLAUDE.md (no `dist/`, `.turbo/`, `coverage/`, `.fbeast/`, `*.db`).
