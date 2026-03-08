# Frankenbeast Agent Ramp-Up

> Concise onboarding doc for AI agents. Keep under 5000 tokens.

## What Is This?

A deterministic guardrails framework for AI agents organized as **11 package directories** in this workspace: **8 core modules** (`frankenfirewall` through `franken-heartbeat`) plus **3 supporting packages** (`franken-types`, `franken-mcp`, `franken-orchestrator`). Most Beast Loop contracts are port-oriented, but the current local CLI path also imports concrete observer classes through `CliObserverBridge`.

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
- `TokenBudget`: 2-arg constructor `(budget, used)`, `.isExhausted()` no args

## Orchestrator Internals

```
franken-orchestrator/src/
├── beast-loop.ts          # BeastLoop.run(input) → BeastResult
├── deps.ts                # BeastLoopDeps (all port interfaces)
├── adapters/              # CliLlmAdapter, CliObserverBridge, AdapterLlmClient, module adapters
├── phases/                # ingestion, hydration, planning, execution, closure
├── breakers/              # injection, budget, critique-spiral circuit breakers
├── checkpoint/            # FileCheckpointStore (plan-scoped crash recovery)
├── closure/               # PrCreator (gh pr create, LLM-powered titles/descriptions)
├── context/               # FrankenContext, context-factory
├── planning/              # ChunkFileGraphBuilder, LlmGraphBuilder, InterviewLoop
├── issues/               # IssueFetcher, IssueTriage, IssueGraphBuilder, IssueReview, IssueRunner
├── skills/                # CliSkillExecutor, MartinLoop, GitBranchIsolator, LlmPlanner, LlmSkillHandler
│   └── providers/         # ICliProvider, ProviderRegistry, ClaudeProvider, CodexProvider, GeminiProvider, AiderProvider
├── cli/                   # run.ts, session.ts, args.ts, config-loader.ts, dep-factory.ts, review-loop.ts, cleanup.ts, trace-viewer.ts
├── resilience/            # context-serializer, graceful-shutdown, module-initializer
├── config/                # OrchestratorConfigSchema (Zod), defaultConfig
└── logging/               # BeastLogger (ANSI badges, service labels, crash-safe incremental file logging)
```

**BeastContext**: Mutable state accumulator — `sessionId`, `projectId`, `userInput`, `phase`, `sanitizedIntent`, `plan`, `tokenSpend`, `audit`.

**BeastLoopDeps**: Port interfaces for `IFirewallModule`, `ISkillsModule`, `IMemoryModule`, `IPlannerModule`, `IObserverModule`, `ICritiqueModule`, `IGovernorModule`, `IHeartbeatModule`, `ILogger`, plus optional `graphBuilder`, `prCreator`, `mcp`, `cliExecutor`, `checkpoint`, `refreshPlanTasks`.

## CLI Skill Execution Pipeline

- `ProviderRegistry` holds all `ICliProvider` implementations. `createDefaultRegistry()` registers 4 built-in providers: claude, codex, gemini, aider. Each provider is a single file under `src/skills/providers/`.
- `CliLlmAdapter` implements `IAdapter` — wraps an `ICliProvider` instance for single-shot LLM completions used by interview/plan flows. Delegates env filtering and output normalization to the provider.
- `CliObserverBridge` bridges `IObserverModule` ↔ `ObserverDeps` — wires real `TokenCounter`, `CostCalculator`, `CircuitBreaker`, `LoopDetector` from franken-observer into the CLI pipeline. Provides real token counting, cost tracking (USD), and budget enforcement.
- `CliSkillExecutor` spawns CLI tools via `ICliProvider` for multi-iteration task execution
- `MartinLoop` accepts a `ProviderRegistry` and resolves providers from a fallback chain. Rate-limit cascade rotates through providers. Repeats: prompt → capture → check for `<promise>TAG</promise>` or max iterations
- `GitBranchIsolator` creates feature branch per chunk, auto-commits, merges back
- Full Pipeline (Approach C): 3 input modes (chunks / design-doc / interview) → PlanGraph → execute → optional PR
- CLI output uses service labels (`[planner]`, `[observer]`, `[martin]`, etc.) for clarity
- `--verbose` attempts to start a trace viewer HTTP server on `:4040` (SQLiteAdapter + TraceServer)
- `--provider <name>` sets the primary CLI agent (default: `claude`). `--providers <list>` sets a comma-separated fallback chain for rate limits (e.g., `claude,gemini,aider`)
- `--config <path>` loads a JSON config file (merged: CLI args > env > file > defaults). The `providers` section supports `default`, `fallbackChain`, and per-provider `overrides`
- `--design-doc <path>` feeds a design doc directly to LlmGraphBuilder for chunk decomposition
- `--cleanup` removes all build logs, checkpoints, and traces from `.frankenbeast/.build/`
- `frankenbeast issues` — fetches GitHub issues and fixes them autonomously:
  - `--label <labels>` comma-separated labels (e.g. `critical,high`)
  - `--search <query>` GitHub search syntax (e.g. `"label:bug label:high"`)
  - `--milestone <name>` filter by milestone
  - `--assignee <user>` filter by assignee
  - `--limit <n>` max issues to fetch (default: 30)
  - `--repo <owner/repo>` target repository (auto-inferred from `gh repo view` if omitted)
  - `--dry-run` preview triage without executing
- Build artifacts are plan-scoped under `.frankenbeast/.build/`: `<plan-name>.checkpoint` for execution state, `<plan-name>-<datetime>-build.log` for session logs (written incrementally, crash-safe). Different plans have independent checkpoints and log histories.
- Current local CLI dep wiring is mixed: observer + CLI adapters are real, but `firewall`, `skills`, `memory`, `planner`, `critique`, `governor`, and `heartbeat` are stubbed in `src/cli/dep-factory.ts`

## Build & Test

```bash
npm run build        # Root build loop over 10 package dirs (currently skips franken-mcp)
npm run test         # Root Vitest run
npm run test:all     # Per-module test loop + root Vitest (currently skips franken-mcp)
npm run typecheck    # tsc --noEmit across project
```

Per-module: `cd <module> && npm test`

All modules use `tsc` except `franken-planner` and `franken-observer` (both use `tsup`).

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

1. The local CLI path is only partially wired: observer and CLI execution are real, but several sibling module deps remain stubbed in `franken-orchestrator/src/cli/dep-factory.ts`
2. The current CLI path is not purely ports-only: `CliObserverBridge` imports concrete classes from `@frankenbeast/observer`
3. There is no dedicated `--non-interactive` flag; headless usage currently relies on starting at `plan` or `run` with existing inputs
4. `--resume` is parsed, but it is not wired as a distinct resume control path; checkpoint-based task skipping still works from existing checkpoint files

## Key Documentation

| File | Content |
|------|---------|
| `docs/ARCHITECTURE.md` | Full system overview with Mermaid diagrams |
| `docs/PROGRESS.md` | PR-by-PR progress tracking, verified test counts, and Phase 8 CLI gap-closure work |
| `docs/adr/` | 10 ADRs (monorepo, hex arch, Hono, shared types, Beast Loop, circuit breakers, CLI execution, Approach C, global CLI design, pluggable CLI providers) |
| `docs/guides/` | quickstart, add-llm-provider, wrap-external-agent, fix-github-issues |
| `docs/plans/` | Design docs and implementation plans (MCP, beast-runner, approach-c, CLI E2E, pluggable providers, interview UX, etc.) |

## Development Practices

- **TDD**: Red → Green → Refactor. Tests before implementation.
- **Tracer bullets**: Thin end-to-end slice first, flesh out later.
- **Atomic commits**: One logical change per commit.
- **ADRs**: Document all non-obvious architectural decisions.
- **Git remotes**: SSH format `git@github.com-djm204:djm204/<repo>.git`
- **Martin workflow**: Automated loop — chunks → impl loop → harden loop → merge → verify
