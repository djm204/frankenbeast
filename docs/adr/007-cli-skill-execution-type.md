# ADR-007: CLI Skill Execution Type

## Status
Accepted

## Context
The RALPH loop workflow (chunk decomposition → CLI-spawned AI loops → git branch isolation → observer tracing) was implemented as an ad-hoc build runner script (`plan-2026-03-05/build-runner.ts`). This script duplicates concerns that `franken-observer` (tracing, cost tracking, circuit breakers), `franken-planner` (task ordering via PlanGraph), and `franken-orchestrator` (the execution pipeline) already handle.

We needed a way to execute external CLI AI tools (e.g., `claude --print`, `codex exec`) as first-class skills within the orchestrator, without creating a new module or duplicating existing infrastructure.

## Decision
Absorb the build runner into `franken-orchestrator` as a new skill execution type: `executionType: 'cli'`. Three new components implement this:

1. **CliSkillExecutor** — Implements `ISkillsModule.execute()` for CLI skills. Spawns external CLI tools, runs the ralph loop, and returns a `SkillResult`.
2. **RalphLoop** — Core repeat-until-promise loop: spawn CLI with chunk prompt, detect `<promise>TAG</promise>` in stdout, auto-commit if the provider doesn't. Provider-agnostic.
3. **GitBranchIsolator** — Creates a feature branch per chunk, auto-commits dirty files, and merges back to the base branch on success.

All telemetry is handled by existing observer infrastructure: `TraceContext` for spans, `TokenCounter` + `CostCalculator` for cost, `CircuitBreaker` for budget enforcement, and `LoopDetector` for repeated-failure detection.

Design reference: `docs/plans/2026-03-05-beast-runner-design.md`

## Consequences

**Positive:**
- Reuses existing observer, planner, and circuit breaker infrastructure — no duplication
- CLI tools are first-class skills, benefiting from the same tracing, cost tracking, and governance as built-in skills
- No new modules — keeps the module count stable
- Provider-agnostic: works with any CLI AI tool that writes to stdout

**Negative:**
- Couples CLI tool availability (e.g., `claude` binary on PATH) to the orchestrator runtime
- Git operations become a skill-level concern rather than an infrastructure concern
- Promise tag format (`<promise>TAG</promise>`) is a convention that must be maintained across all CLI providers
