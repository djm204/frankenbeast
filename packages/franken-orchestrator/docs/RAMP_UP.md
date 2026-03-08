# franken-orchestrator Ramp-Up

The Beast Loop orchestrator wires all 8 Frankenbeast modules (firewall, skills, memory, planner, observer, critique, governor, heartbeat) into a single agent pipeline that takes user input and produces a `BeastResult`.

## Directory Structure

```
src/
  index.ts                          # Public API barrel
  beast-loop.ts                     # BeastLoop class — top-level run(input)
  deps.ts                           # BeastLoopDeps + all port interfaces
  types.ts                          # BeastInput, BeastResult, TaskOutcome, BeastPhase
  logger.ts                         # NullLogger default
  config/
    orchestrator-config.ts          # Zod schema, OrchestratorConfig, defaultConfig()
  context/
    franken-context.ts              # BeastContext class (mutable state)
    context-factory.ts              # createContext(BeastInput) → BeastContext
  phases/
    ingestion.ts                    # Phase 1a: firewall scan → sanitizedIntent
    hydration.ts                    # Phase 1b: memory frontload → enrich context
    planning.ts                     # Phase 2: plan + critique loop
    execution.ts                    # Phase 3: topological task execution
    closure.ts                      # Phase 4: token spend, heartbeat, assemble result
  breakers/
    injection-breaker.ts            # checkInjection(FirewallResult)
    budget-breaker.ts               # checkBudget(spend, maxTokens)
    critique-spiral-breaker.ts      # checkCritiqueSpiral(iter, max, score)
  planning/
    chunk-file-graph-builder.ts     # Mode 1: .md chunk files → PlanGraph
    llm-graph-builder.ts            # Mode 2: LLM decomposes design doc → PlanGraph
    interview-loop.ts               # Mode 3: user interview → design doc → PlanGraph
  skills/
    cli-types.ts                    # MartinLoopConfig, CliSkillConfig, GitIsolationConfig
    cli-skill-executor.ts           # CliSkillExecutor: git isolate → ralph → merge
    martin-loop.ts                   # MartinLoop: spawn claude/codex, promise detection, rate-limit fallback
    git-branch-isolator.ts          # GitBranchIsolator: branch per chunk, auto-commit, merge
    llm-skill-handler.ts            # LlmSkillHandler
    llm-planner.ts                  # LlmPlanner
  adapters/
    adapter-llm-client.ts           # AdapterLlmClient wrapping IAdapter
    firewall-adapter.ts, memory-adapter.ts, etc.
  checkpoint/
    file-checkpoint-store.ts        # FileCheckpointStore: append-only file, recordCommit/lastCommit
  resilience/
    context-serializer.ts           # serialize/deserializeContext, saveContext, loadContext
    graceful-shutdown.ts            # GracefulShutdown: SIGTERM/SIGINT → save context + cleanup
    module-initializer.ts           # checkModuleHealth(deps), allHealthy()
  logging/
    beast-logger.ts                 # BeastLogger, ANSI helpers, budgetBar, statusBadge
  closure/
    pr-creator.ts                   # PrCreator: auto-create GitHub PR via gh CLI
  cli/
    args.ts                         # parseArgs() → CliArgs
    config-loader.ts                # loadConfig(): file > env > CLI merge
    run.ts                          # bin entry (frankenbeast CLI)
```

## Core Flow

`BeastLoop.run(input: BeastInput): Promise<BeastResult>`

1. **Ingestion** -- `runIngestion(ctx, firewall)` -- firewall scans raw input; blocked = `InjectionDetectedError`; else sets `ctx.sanitizedIntent`
2. **Hydration** -- `runHydration(ctx, memory)` -- frontloads ADRs/errors/rules into `ctx.sanitizedIntent.context`
3. **Planning** -- `runPlanning(ctx, planner, critique, config, graphBuilder?)` -- if `graphBuilder` provided, uses it directly; otherwise loops planner+critique up to `maxCritiqueIterations`; throws `CritiqueSpiralError` on exhaustion
4. **Execution** -- `runExecution(ctx, skills, governor, memory, observer, ...)` -- topological task execution; HITL check via governor; supports CLI skill delegation, checkpoint skip, plan refresh
5. **Closure** -- `runClosure(ctx, observer, heartbeat, config, outcomes, prCreator?)` -- collects token spend, optional heartbeat pulse, optional PR creation, returns `BeastResult`

## Key Types

**BeastContext** (mutable state accumulator):
`projectId`, `sessionId`, `userInput`, `sanitizedIntent?`, `plan?`, `phase`, `tokenSpend`, `audit[]`, `elapsedMs()`

**BeastLoopDeps** (all ports):
`firewall`, `skills`, `memory`, `planner`, `observer`, `critique`, `governor`, `heartbeat`, `logger`, `clock`, plus optional: `graphBuilder`, `prCreator`, `mcp`, `cliExecutor`, `checkpoint`, `refreshPlanTasks`

**OrchestratorConfig**: `maxCritiqueIterations` (3), `maxTotalTokens` (100k), `maxDurationMs` (300k), `enableHeartbeat`, `enableTracing`, `minCritiqueScore` (0.7). Config priority: CLI > env (`FRANKEN_*`) > file > defaults.

## Circuit Breakers

- `checkInjection(result)` -- halts on `result.blocked`
- `checkBudget(spend, max)` -- halts when `totalTokens > max`
- `checkCritiqueSpiral(iter, max, score)` -- halts when iterations exhausted

## Planning Builders (GraphBuilder interface)

- **ChunkFileGraphBuilder(dir)** -- Mode 1: reads numbered `.md` files, produces `impl:` + `harden:` task pairs in linear order
- **LlmGraphBuilder(llm, opts?)** -- Mode 2: LLM decomposes a design doc into chunks with dependency DAG; validates no cycles; produces `impl:` + `harden:` pairs
- **InterviewLoop(llm, io, graphBuilder)** -- Mode 3: asks user clarifying questions, generates design doc, delegates to `LlmGraphBuilder`

## CLI Skill Execution

- **CliSkillExecutor(ralph, git, observer)** -- orchestrates git isolation, Martin loop, merge, observer spans, budget checks, dirty-file recovery
- **MartinLoop** -- spawns `claude`/`codex` CLI per iteration; detects `<promise>TAG</promise>` in output; multi-provider fallback on rate limit; parses reset times; abort-signal aware
- **GitBranchIsolator(config)** -- `isolate(chunkId)`, `autoCommit()`, `merge()`, `resetHard()`

## Crash Recovery

- **FileCheckpointStore(path)** -- append-only file; `has(key)`, `write(key)`, `recordCommit()`, `lastCommit()`; execution phase skips tasks with `checkpoint.has(\`${taskId}:done\`)`
- **Context serialization** -- `saveContext(ctx, path)` / `loadContext(path)`; `ContextSnapshot` is the JSON shape
- **GracefulShutdown** -- installs SIGTERM/SIGINT handlers; saves context snapshot + runs cleanup handlers

## CLI (bin: frankenbeast)

```
frankenbeast --project-id <id> [--config <path>] [--provider <name>] [--model <name>]
             [--dry-run] [--verbose] [--resume <snapshot-path>] [--help]
```

Full execution currently requires concrete module implementations; `--dry-run` and `--resume` work.

## Build & Test

```sh
npm run build          # tsc
npm test               # vitest run
npm run test:watch     # vitest
npm run test:coverage  # vitest run --coverage
npm run typecheck      # tsc --noEmit
```

## Dependencies

- `@franken/types` (local workspace) -- `TokenSpend`, `ILlmClient`
- `zod` ^3.24 -- config validation
- Node >= 22

## Gotchas

- `TokenBudgetBreaker.check()` (from franken-observer) is sync and always returns `{tripped: false}` -- use `checkAsync()` instead
- `executeTask()` is stub-level for non-CLI skills -- it calls `skills.execute()` but real LLM orchestration relies on `CliSkillExecutor`
- CLI `--resume` currently only displays snapshot info; full re-execution from saved phase is not wired
- `MartinLoop` rate-limit detection only checks stderr (not stdout) to avoid false positives when the model's output discusses rate limiting
