# ADR-008: Full Pipeline — Idea to PR

## Status
Accepted

## Context
Approach A ([ADR-007](007-cli-skill-execution-type.md)) provided CLI skill primitives (`CliSkillExecutor`, `MartinLoop`, `GitBranchIsolator`) that absorb the Martin loop into the orchestrator. However, the build-runner still reimplements plan decomposition, checkpoint tracking, and PR creation outside the orchestrator. There is no path from "I have an idea" to "here's a PR" without the human writing all intermediate artifacts (chunk files, build-runner scripts).

We needed the orchestrator to own the full pipeline: accept an idea in any form, decompose it into executable chunks, run them through the existing CLI skill pipeline, checkpoint progress for crash recovery, and create a PR at the end.

Design reference: [`docs/plans/2026-03-05-approach-c-full-pipeline-design.md`](../plans/2026-03-05-approach-c-full-pipeline-design.md)

## Decision
Three input modes converge to a single `PlanGraph` that executes through the existing Approach A pipeline:

1. **`chunks` mode** — `ChunkFileGraphBuilder` reads pre-written `.md` chunk files from a directory and produces a `PlanGraph` with impl+harden task pairs. No LLM involved.

2. **`design-doc` mode** — `LlmGraphBuilder` takes a design document string, sends it to `ILlmClient.complete()` with a decomposition prompt, and parses the response into a `PlanGraph` with impl+harden task pairs.

3. **`interview` mode** — `InterviewLoop` runs an interactive Q&A loop using `ILlmClient` to gather requirements from the user, generates a design doc string, and feeds it into `LlmGraphBuilder` for decomposition.

All three modes produce the same artifact — a `PlanGraph` — which enters the existing execution pipeline unchanged.

Additional components:

- **`FileCheckpointStore`** — Append-only file checkpoint store. Every atomic commit produces a checkpoint entry; milestone checkpoints (impl_done, harden_done, merged) are written on top. On resume, dirty files are kept if tests pass, discarded only if broken.

- **`PrCreator`** — Runs `gh pr create` in the closure phase, targeting `--base-branch` (default: `main`). Generates title and body from `BeastResult`. Idempotent: skips if a PR already exists for the branch. Only runs if all tasks passed and `--no-pr` is not set.

- **Build-runner refactor** — The 1,100-line `build-runner.ts` becomes a ~150-line thin CLI shell: parse args, select `GraphBuilder`, construct `BeastLoopDeps`, call `BeastLoop.run()`, display summary, exit.

## Consequences

**Positive:**
- Single execution path regardless of input mode — all three converge to `PlanGraph`
- Per-commit checkpoint granularity enables crash recovery without losing passing work
- Full automation possible: idea → interview → decomposition → implementation → PR
- Build-runner becomes a thin shell over `BeastLoop.run()`, eliminating logic duplication
- Reuses existing Approach A infrastructure: `CliSkillExecutor`, `MartinLoop`, `GitBranchIsolator`, observer tracing, circuit breakers

**Negative:**
- LLM decomposition quality depends on prompt engineering — poor decomposition produces poor chunk ordering
- Interview mode adds interactive complexity (requires `InterviewIO` interface for user interaction)
- `gh` CLI must be installed for PR creation (mitigated: checked on startup, falls back to `--no-pr`)
- Checkpoint file format is append-only plain text — not suitable for concurrent writers
