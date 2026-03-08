# ADR 009: Global CLI Design

## Status

Accepted

## Context

Frankenbeast's CLI (`franken-orchestrator/src/cli/run.ts`) was stub-level — only `--dry-run` worked. The real execution capability lived in per-plan `build-runner.ts` files (e.g., `plan-approach-c/build-runner.ts`). Users had to copy and adapt the build-runner for each new plan.

We need a single `frankenbeast` command that works as a drop-in tool in any project.

## Decision

1. **Global installation.** `frankenbeast` is installed globally via `npm install -g franken-orchestrator`. It works in any project without being a project dependency.

2. **Convention-based project layout.** Project state lives in `.frankenbeast/` at the project root:
   - `.frankenbeast/plans/` — design docs and chunk files
   - `.frankenbeast/.build/` — checkpoint, traces, logs
   - `.frankenbeast/config.json` — optional project-level config

3. **Three entry modes with HITM review loops:**
   - No files → interview → design doc → [review] → chunks → [review] → execution
   - `--design-doc` → chunks → [review] → execution
   - `--plan-dir` or chunks in `.frankenbeast/plans/` → execution

4. **Subcommands as building blocks.** `frankenbeast interview`, `frankenbeast plan`, `frankenbeast run` for standalone phase execution.

5. **Base branch safety.** Auto-detects current branch, prompts for confirmation if not `main`.

## Consequences

- Per-plan `build-runner.ts` files are no longer needed for new plans
- Users can go from idea to PR in a single interactive session
- Project-local module access (importing individual modules) is deferred to a future iteration
- Additional CLI provider support (beyond claude/codex) is deferred (resolved by [ADR-010](010-pluggable-cli-providers.md))

## Supersedes

None (new capability).
