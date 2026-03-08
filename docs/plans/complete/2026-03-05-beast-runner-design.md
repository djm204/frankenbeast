# Beast Runner — Productized RALPH Loop Build System

## Problem

The RALPH loop workflow (chunk decomposition → CLI-spawned AI loops → git branch isolation → observer tracing) works well as an ad-hoc script (`plan-2026-03-05/build-runner.ts`), but it should be a first-class capability of the Frankenbeast framework. Currently the build runner duplicates concerns that franken-observer, franken-planner, and franken-orchestrator already handle.

## Decision

**Approach A: Absorb** — integrate the build runner's core loop into `franken-orchestrator` as a new skill execution type (`cli`), reusing existing infrastructure. No new modules.

**Approach C (future):** Full BeastLoop pipeline where design docs enter as `userInput`, get decomposed by the planner into a `PlanGraph`, and execute autonomously through all 4 phases.

We build A first. C extends A later.

## Architecture

### Approach A — Absorb into Orchestrator

```
chunk.md on disk
  → CliSkillExecutor.execute(SkillInput)
    → GitBranchIsolator.isolate(chunkId, baseBranch)
      → RalphLoop.run(prompt, promiseTag, maxIters)
        → spawn claude --print (or codex exec)
        → detect <promise>TAG</promise> in stdout
        → auto-commit if provider doesn't commit
      → GitBranchIsolator.merge()
    → observer: TraceContext spans per iteration
    → observer: TokenCounter + CostCalculator per chunk
    → observer: CircuitBreaker for budget enforcement
  → SkillResult { output, tokensUsed }
```

### New Components (A)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `CliSkillExecutor` | `franken-orchestrator/src/skills/cli-skill-executor.ts` | Implements `ISkillsModule.execute()` for `executionType: 'cli'`. Spawns CLI tools, runs ralph loop, returns `SkillResult`. |
| `RalphLoop` | `franken-orchestrator/src/skills/ralph-loop.ts` | Core loop: repeat prompt until `<promise>` detected or max iterations. Provider-agnostic (claude/codex). |
| `GitBranchIsolator` | `franken-orchestrator/src/skills/git-branch-isolator.ts` | Create branch, auto-commit dirty files, merge back to base. |
| `executionType: 'cli'` | `franken-orchestrator/src/deps.ts` | Extend `SkillDescriptor.executionType` union with `'cli'`. |

### Reused Infrastructure (A)

| Concern | Module | What It Does |
|---------|--------|-------------|
| Tracing | `franken-observer` | `TraceContext.startSpan()` per iteration, `SpanLifecycle.recordTokenUsage()` |
| Budget | `franken-observer` | `CircuitBreaker.check()` before each iteration |
| Cost | `franken-observer` | `CostCalculator.totalCost()` with per-chunk snapshots |
| Loop detection | `franken-observer` | `LoopDetector` detects repeated failures |
| Persistence | `franken-observer` | `SQLiteAdapter.flush()` for trace DB |
| Task ordering | `franken-planner` | `PlanGraph.topoSort()` for chunk dependency order |
| Execution | `franken-orchestrator` | `executeTask()` calls `skills.execute()` — already wired |

### Approach C — Full BeastLoop Pipeline (future, extends A)

```
design-doc.md as BeastInput.userInput
  → Phase 1 (Ingestion): firewall sanitizes, memory hydrates with ADRs/rules
  → Phase 2 (Planning): ChunkDecomposer uses ILlmClient to split design doc into PlanGraph tasks
    → each task: requiredSkills: ['cli:claude'], dependency edges
    → critique loop validates ordering
  → Phase 3 (Execution): executeTask() processes in topoSort() order via CliSkillExecutor
  → Phase 4 (Closure): merge chunk branches, finalize traces, heartbeat
  → BeastResult with full token spend + task outcomes
```

### Additional Components (C, beyond A)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `ChunkDecomposer` | `franken-orchestrator/src/planning/chunk-decomposer.ts` | Uses `ILlmClient.complete()` to decompose design doc into ordered chunk tasks with dependencies. |
| `DesignDocIngester` | `franken-orchestrator/src/ingestion/design-doc-ingester.ts` | Reads design doc, validates structure, extracts metadata into `MemoryContext`. |
| Closure extension | `franken-orchestrator/src/phases/closure.ts` | Multi-branch merge in dependency order after all tasks complete. |

## Tracer Bullets

### Tracer Bullet A — Single Chunk Through Orchestrator

**Goal:** One chunk file → `CliSkillExecutor` → spawns `claude --print` OR `codex` → ralph loop with promise detection → git branch isolation → observer tracing → `SkillResult` returned to `executeTask()`.

**Proves:**
- `executeTask()` → `skills.execute()` works for CLI-spawned AI tools
- Observer tracing integrates without modification
- Git isolation works as a skill-level concern
- Ralph loop (repeat until promise) works inside the skill abstraction

**Integration test:** Feed one `.md` chunk through `BeastLoop.run()` with a mock planner returning a 1-task `PlanGraph` with `requiredSkills: ['cli:claude']`. Verify: CLI spawned, promise detected, branch created+merged, trace spans recorded, `TaskOutcome.status === 'success'`.

### Tracer Bullet C — Design Doc Through Full Pipeline

**Goal:** Design doc enters `BeastLoop.run()` as `userInput` → flows through all 4 phases → planner decomposes into `PlanGraph` → chunks execute via `CliSkillExecutor` → merged feature branch with full traces.

**Proves (beyond A):**
- Full 4-phase pipeline handles design-doc-to-code autonomously
- LLM-driven chunk decomposition integrates with `PlanGraph`
- Dependency ordering preserved through planning → execution
- Closure handles multi-branch git merges
- Framework fully replaces ad-hoc `build-runner.ts`

## Key Design Decisions

1. **CLI-first execution** — spawn `claude --print` / `codex exec` as child processes, don't use APIs directly. This keeps provider coupling at the edge.

2. **Git is a core responsibility** — `GitBranchIsolator` handles branch creation, auto-commit, and merge. Not optional, not a plugin.

3. **Design doc discovery** — when no chunk files exist, check for `design-doc.md` or `*-design.md`. If missing, prompt the user (don't silently fail).

4. **Lives in franken-orchestrator** — no new modules. The orchestrator already has the execution pipeline; we're adding a new skill type.

5. **Observer handles all telemetry** — no custom logging/tracing in the skill executor. Use `TraceContext`, `SpanLifecycle`, `TokenCounter`, `CostCalculator`, `CircuitBreaker` from `@frankenbeast/observer`.

## Build Order

**Phase 1 (Approach A):** `CliSkillExecutor` + `RalphLoop` + `GitBranchIsolator` + `executionType: 'cli'` + integration test proving single chunk works.

**Phase 2 (Approach C):** `ChunkDecomposer` + `DesignDocIngester` + closure extension + E2E test proving design doc → merged branch works.

## Risks

| Risk | Mitigation |
|------|-----------|
| `claude --print` output format changes | Parse stream-json, fall back to raw stdout |
| Promise tag buried in JSON metadata | Search raw stdout, not just parsed content |
| Git merge conflicts between chunks | Fail fast, report conflict, let user resolve |
| Budget overshoot (iteration completes before check) | Pre-check budget at top of loop before spawning |
| Recursive JSON escaping (codex reads its own output) | Build artifacts in gitignored `.build/` directory |
