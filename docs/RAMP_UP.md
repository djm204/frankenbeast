# Frankenbeast Agent Ramp-Up

> Concise onboarding doc for AI agents. Keep under 5000 tokens.

## What Is This?

A 10-module deterministic guardrails framework for AI agents. Hexagonal architecture (ports & adapters) — the orchestrator depends only on interfaces, never concrete implementations.

## Modules

| ID | Directory | Purpose |
|----|-----------|---------|
| MOD-01 | `frankenfirewall/` | LLM proxy, injection scanning, PII masking, adapters (Claude/OpenAI/Ollama) |
| MOD-02 | `franken-skills/` | Skill registry & discovery (`ISkillRegistry`, `UnifiedSkillContract`) |
| MOD-03 | `franken-brain/` | Memory systems (working/episodic/semantic), PII guards |
| MOD-04 | `franken-planner/` | DAG planning, CoT reasoning, plan versioning, recovery |
| MOD-05 | `franken-observer/` | Traces, cost tracking, circuit breakers, evals, OTEL/Prometheus/Langfuse adapters |
| MOD-06 | `franken-critique/` | Self-critique pipeline, evaluators, lesson recording |
| MOD-07 | `franken-governor/` | HITL approval gates, triggers (budget/skill/confidence/ambiguity), CLI/Slack channels |
| MOD-08 | `franken-heartbeat/` | Proactive reflection, morning briefs, checklists |
| shared | `franken-types/` | Branded IDs, Result monad, Severity, ILlmClient, RationaleBlock, FrankenContext |
| MCP | `franken-mcp/` | MCP server client & registry |
| orch | `franken-orchestrator/` | Beast Loop, CLI, phases, circuit breakers, skill execution, crash recovery |

## The Beast Loop (4 Phases)

```
User Input → [Ingestion] → [Planning] → [Execution] → [Closure] → BeastResult
                 ↑              ↑             ↑
           Circuit Breakers: injection / budget / critique-spiral
```

1. **Ingestion** — Firewall sanitization + memory hydration (project context)
2. **Planning** — PlanGraph creation + critique loop (max N iterations)
3. **Execution** — Topological task execution through skill executors + HITL gates
4. **Closure** — Token accounting, heartbeat pulse, PR creation, result assembly

## Key API Patterns

- `IAdapter`: `transformRequest`, `execute`, `transformResponse`, `validateCapabilities`
- `BaseAdapter`: retry, timeout, cost calculation built-in
- Brain `ILlmClient`: `complete(prompt: string): Promise<string>`
- Heartbeat `IResultLlmClient`: `complete(prompt, opts?): Promise<Result<string>>`
- `GovernorCritiqueAdapter`: passes rationale as `unknown` to evaluators
- `BudgetTrigger()`, `SkillTrigger()`: parameterless constructors
- `TriggerRegistry.evaluateAll()` (not `.evaluate()`)
- `CritiqueLoop` returns `'fail'` (not `'halted'`) on max iterations
- `TokenBudgetBreaker.check()` is sync, always `{tripped: false}` — use `checkAsync()`
- `PlanGraph`: `.size()`, `.topoSort()`, `.addTask(task, [depIds])`
- `TokenBudget`: 2-arg constructor `(budget, totalTokens)`, `.isExhausted()` no args

## Orchestrator Internals

```
franken-orchestrator/src/
├── beast-loop.ts          # BeastLoop.run(input) → BeastResult
├── deps.ts                # BeastLoopDeps (all port interfaces)
├── adapters/              # CliLlmAdapter (claude --print), CliObserverBridge
├── phases/                # ingestion, hydration, planning, execution, closure
├── breakers/              # injection, budget, critique-spiral circuit breakers
├── checkpoint/            # FileCheckpointStore (crash recovery)
├── planning/              # ChunkFileGraphBuilder, LlmGraphBuilder, InterviewLoop
├── skills/                # CliSkillExecutor, RalphLoop, GitBranchIsolator
├── cli/                   # args.ts, config-loader.ts, run.ts, trace-viewer.ts
├── resilience/            # context-serializer, graceful-shutdown, module-initializer
├── config/                # OrchestratorConfigSchema (Zod), defaultConfig
└── logging/               # BeastLogger (ANSI badges, service labels)
```

**BeastContext**: Mutable state accumulator — sessionId, projectId, phase, sanitizedIntent, plan (PlanGraph), taskOutcomes, auditTrail, tokenBudget, traceContext.

**BeastLoopDeps**: Port interfaces for IFirewallModule, ISkillsModule, IMemoryModule, IPlannerModule, IObserverModule, ICritiqueModule, IGovernorModule, IHeartbeatModule, ICheckpointStore, ILogger.

## CLI Skill Execution Pipeline

- `CliLlmAdapter` implements `IAdapter` — wraps `claude --print` for single-shot LLM completions (planning, design-doc generation, interview). Env-safe: strips all `CLAUDE*` vars.
- `CliObserverBridge` bridges `IObserverModule` ↔ `ObserverDeps` — wires real `TokenCounter`, `CostCalculator`, `CircuitBreaker`, `LoopDetector` from franken-observer into the CLI pipeline. Provides real token counting, cost tracking (USD), and budget enforcement.
- `CliSkillExecutor` spawns CLI tools (claude --print, codex exec) for multi-iteration task execution
- `RalphLoop` repeats: prompt → capture → check for `<promise>TAG</promise>` or max iterations
- `GitBranchIsolator` creates feature branch per chunk, auto-commits, merges back
- Full Pipeline (Approach C): 3 input modes (chunks / design-doc / interview) → PlanGraph → execute → PR
- CLI output uses service labels (`[planner]`, `[observer]`, `[ralph]`, etc.) for clarity
- `--verbose` starts a trace viewer HTTP server on `:4040` (SQLiteAdapter + TraceServer)
- `--config <path>` loads a JSON config file (merged: CLI args > env > file > defaults)
- `--design-doc <path>` feeds a design doc directly to LlmGraphBuilder for chunk decomposition

## Build & Test

```bash
npm run build        # Build all modules in dependency order
npm run test         # Root integration tests (vitest)
npm run test:all     # All module tests + root integration (1,572 tests)
npm run typecheck    # tsc --noEmit across project
```

Per-module: `cd <module> && npm test`

All modules use `tsc` except `franken-planner` (uses `tsup`).

## Project Config

- **TypeScript**: ES2022, Node.js native ESM, strict mode, path aliases (`@franken/types`, etc.)
- **Test framework**: Vitest
- **HTTP framework**: Hono (firewall, critique, governor services)
- **Validation**: Zod (v3 most modules; heartbeat uses zod/v4)
- **Docker**: docker-compose.yml for ChromaDB, Grafana, Tempo

## Type Safety Conventions

- Branded IDs everywhere: `TaskId`, `ProjectId`, `SessionId`, `RequestId`, `SpanId`, `TraceId`
- `Result<T, E>` monad for expected failures
- Zod schemas at system boundaries (config, CLI args, LLM responses)
- Discriminated unions for state machines (CritiqueLoopResult: pass | fail | halted | escalated)

## Known Limitations

1. Orchestrator depends on port interfaces, not implementations (by design — hexagonal architecture)
2. No `--non-interactive` flag for CI/headless use (review loops require stdin)
3. E2E tests require `npm run build` before execution (no `pretest:e2e` script)

## Key Documentation

| File | Content |
|------|---------|
| `docs/ARCHITECTURE.md` | Full system overview with Mermaid diagrams |
| `docs/PROGRESS.md` | PR-by-PR progress tracking (Phases 1-7 complete, 42 PRs) |
| `docs/adr/` | 8 ADRs (monorepo, hex arch, Hono, shared types, Beast Loop, circuit breakers, CLI execution, Approach C) |
| `docs/guides/` | quickstart, add-llm-provider, wrap-external-agent |
| `docs/plans/` | Design docs for MCP, execute-task, beast-runner, approach-c |

## Development Practices

- **TDD**: Red → Green → Refactor. Tests before implementation.
- **Tracer bullets**: Thin end-to-end slice first, flesh out later.
- **Atomic commits**: One logical change per commit.
- **ADRs**: Document all non-obvious architectural decisions.
- **Git remotes**: SSH format `git@github.com-djm204:djm204/<repo>.git`
- **RALPH workflow**: Automated loop — chunks → impl loop → harden loop → merge → verify
