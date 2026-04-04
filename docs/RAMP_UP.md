# Frankenbeast Agent Ramp-Up

> Concise onboarding doc for AI agents. Keep under 5000 tokens.

## What Is This?

A deterministic guardrails framework for AI agents organized as an **npm workspaces monorepo with Turborepo** for build orchestration. All **8 packages** live under `packages/`. Cross-package dependencies use workspace references (e.g., `@franken/types`). See [ADR-011](adr/011-monorepo-migration.md). Architecture consolidation (ADR-031) reduced from 13 to 8 packages — firewall, skills, heartbeat, MCP deleted; comms absorbed into orchestrator.

## Modules

| Package | Purpose |
|---------|---------|
| `packages/franken-types/` | Branded IDs, Result monad, Severity, ILlmClient, RationaleBlock, FrankenContext |
| `packages/franken-brain/` | Memory systems (working/episodic/semantic), PII guards |
| `packages/franken-planner/` | DAG planning, CoT reasoning, plan versioning, recovery |
| `packages/franken-observer/` | Traces, cost tracking, circuit breakers, evals, OTEL/Prometheus/Langfuse adapters |
| `packages/franken-critique/` | Self-critique pipeline, evaluators, lesson recording |
| `packages/franken-governor/` | HITL approval gates, triggers (budget/skill/confidence/ambiguity), CLI/Slack channels |
| `packages/franken-web/` | React web dashboard — chat UI, beast catalog/dispatch controls, network config, metrics |
| `packages/franken-orchestrator/` | Beast Loop, CLI, chat server, comms gateway (Slack/Discord/Telegram/WhatsApp), beast control APIs, phases, circuit breakers, skill execution, crash recovery |

## The Beast Loop (4 Phases)

```
User Input → [Ingestion] → [Planning] → [Execution] → [Closure] → BeastResult
                 ↑              ↑             ↑
           Circuit Breakers: injection / budget / critique-spiral
```

1. **Ingestion** — Input validation + memory hydration (project context)
2. **Planning** — PlanGraph creation + critique loop (max N iterations)
3. **Execution** — Topological task execution through skill executors + HITL gates
4. **Closure** — Token accounting, PR creation, result assembly

## Key API Patterns

- Brain `ILlmClient`: `complete(prompt: string): Promise<string>`
- `GovernorCritiqueAdapter`: passes rationale as `unknown` to evaluators
- `BudgetTrigger()`, `SkillTrigger()`: parameterless constructors
- `TriggerRegistry.evaluateAll()` (not `.evaluate()`)
- `CritiqueLoop` returns `'fail'` (not `'halted'`) on max iterations
- `TokenBudgetBreaker.check()` is sync, always `{tripped: false}` — use `checkAsync()`
- `PlanGraph`: `.size()`, `.topoSort()`, `.addTask(task, [depIds])`
- `TokenBudget`: 2-arg constructor `(budget, used)`, `.isExhausted()` no args

## Orchestrator Internals

```
packages/franken-orchestrator/src/
├── beast-loop.ts          # BeastLoop.run(input) → BeastResult
├── deps.ts                # BeastLoopDeps (all port interfaces)
├── adapters/              # CliLlmAdapter, CliObserverBridge, AdapterLlmClient, module adapters
├── phases/                # ingestion, hydration, planning, execution, closure
├── breakers/              # injection, budget, critique-spiral circuit breakers
├── checkpoint/            # FileCheckpointStore (plan-scoped crash recovery)
├── closure/               # PrCreator (gh pr create, LLM-powered titles/descriptions)
├── context/               # FrankenContext, context-factory
├── planning/              # ChunkFileGraphBuilder, LlmGraphBuilder, InterviewLoop
├── session/               # ChunkSession store, renderer, compactor, GC
├── issues/               # IssueFetcher, IssueTriage, IssueGraphBuilder, IssueReview, IssueRunner
├── skills/                # CliSkillExecutor, MartinLoop, GitBranchIsolator, LlmPlanner, LlmSkillHandler
│   └── providers/         # ICliProvider, ProviderRegistry, ClaudeProvider, CodexProvider, GeminiProvider, AiderProvider
├── chat/                  # ConversationEngine, IntentRouter, EscalationPolicy, ChatRuntime, ChatAgentExecutor, TurnRunner, session-store, output-sanitizer, chat-runtime-factory
├── http/                  # chat-server.ts, chat-app.ts, ws-chat-server.ts, sse.ts, middleware.ts (HTTP + WebSocket for franken-web)
├── cli/                   # run.ts, session.ts, args.ts, config-loader.ts, dep-factory.ts, chat-repl.ts, spinner.ts, review-loop.ts, cleanup.ts
├── resilience/            # context-serializer, graceful-shutdown, module-initializer
├── config/                # OrchestratorConfigSchema (Zod), defaultConfig
└── logging/               # BeastLogger (ANSI badges, service labels, crash-safe incremental file logging)
```

**BeastContext**: Mutable state accumulator — `sessionId`, `projectId`, `userInput`, `phase`, `sanitizedIntent`, `plan`, `tokenSpend`, `audit`.

**BeastLoopDeps**: Port interfaces for `IFirewallModule`, `ISkillsModule`, `IMemoryModule`, `IPlannerModule`, `IObserverModule`, `ICritiqueModule`, `IGovernorModule`, `IHeartbeatModule`, `ILogger`, plus optional `graphBuilder`, `prCreator`, `mcp`, `cliExecutor`, `checkpoint`, `refreshPlanTasks`.

## CLI Skill Execution Pipeline

- `ProviderRegistry` holds all `ICliProvider` implementations. `createDefaultRegistry()` registers 4 built-in providers: claude, codex, gemini, aider. Each provider is a single file under `src/skills/providers/`.
- `CliLlmAdapter` implements `IAdapter` — wraps an `ICliProvider` instance for single-shot LLM completions used by interview/plan flows. Delegates env filtering and output normalization to the provider.
- `CliObserverBridge` bridges `IObserverModule` ↔ `ObserverDeps` — wires real `TokenCounter`, `CostCalculator`, `CircuitBreaker`, `LoopDetector` from franken-observer into the CLI pipeline. Provides real token counting, cost tracking (USD), budget enforcement, and context-window estimation for chunk compaction.
- `CliSkillExecutor` spawns CLI tools via `ICliProvider` for multi-iteration task execution
- `MartinLoop` accepts a `ProviderRegistry` and resolves providers from a fallback chain. When chunk-session services are wired, it loads canonical chunk state from `.frankenbeast/.build/chunk-sessions/`, renders provider requests from normalized transcript state, snapshots before compaction, compacts at `>= 85%` context usage, and can replay that canonical state on provider switch.
- `GitBranchIsolator` creates feature branch per chunk, auto-commits, merges back
- Full Pipeline (Approach C): 3 input modes (chunks / design-doc / interview) → PlanGraph → execute → optional PR
- CLI output uses service labels (`[planner]`, `[observer]`, `[martin]`, etc.) for clarity
- `--verbose` attempts to start a trace viewer HTTP server on `:4040` (SQLiteAdapter + TraceServer)
- `--provider <name>` sets the primary CLI agent (default: `claude`). `--providers <list>` sets a comma-separated fallback chain for rate limits (e.g., `claude,gemini,aider`)
- `--config <path>` loads a JSON config file (merged: CLI args > env > file > defaults). The `providers` section supports `default`, `fallbackChain`, and per-provider `overrides`
- `--design-doc <path>` feeds a design doc directly to LlmGraphBuilder for chunk decomposition
- `frankenbeast chat` — interactive two-tier REPL:
  - **Tier 1 (Conversational)**: Cheap model with `chatMode`, session continuation (`--continue`), quirky spinner, colored output (cyan prompt, green replies)
  - **Tier 2 (Execution)**: `/run <desc>` spawns a full-permissions CLI agent. `/plan <desc>` dispatches to planning. Natural language also triggers execution via IntentRouter → EscalationPolicy
  - `ChatRuntime` orchestrates all turn processing (slash commands, engine dispatch, execution). `ConversationEngine` handles LLM replies. `TurnRunner` handles execution dispatch. `ChatAgentExecutor` implements `ITaskExecutor`
  - `sanitizeChatOutput()` strips raw web search JSON and REMINDER instruction blocks from Claude CLI output
  - `chat-runtime-factory.ts` wires the engine, runtime, and turn runner from config
- `frankenbeast chat-server` — HTTP + WebSocket server for franken-web dashboard:
  - `startChatServer()` binds TCP, wires auth (session tokens), session persistence, and WebSocket attachment
  - `ChatSocketController` handles WebSocket connections with chunk-based content delivery and turn event streaming
  - Shares the same `ChatRuntime` as the CLI REPL
- Beast control catalog currently exposes three operator flows: `design-interview`, `chunk-plan` (labeled `Design Doc -> Chunk Creation` and using a `file` prompt for `designDocPath`), and `martin-loop` (now requiring `chunkDirectory` with a `directory` prompt)
- Tracked-agent domain types, HTTP routes, and dashboard wiring now sit below the beast control layer so init lifecycle state can exist before a Beast run is dispatched
- **Beast daemon execution pipeline**: `ProcessBeastExecutor` manages spawned agent processes with config file passthrough (`FRANKENBEAST_RUN_CONFIG` env var), `ProcessSupervisor` three-way exit gate, early stdout/stderr buffering, and stop/kill escalation (SIGTERM → timeout → SIGKILL). `BeastEventBus` publishes real-time `run.status`, `run.log`, and `agent.status` events to SSE subscribers. `SseConnectionTicketStore` authenticates EventSource connections via single-use tickets (ADR-030). Config files are written to `.frankenbeast/.build/run-configs/` and cleaned up on terminal state.
- `--cleanup` removes build logs, checkpoints, traces, chunk sessions, and chunk-session snapshots from `.frankenbeast/.build/`
- `frankenbeast issues` — fetches GitHub issues and fixes them autonomously:
  - `--label <labels>` comma-separated labels (e.g. `critical,high`)
  - `--search <query>` GitHub search syntax (e.g. `"label:bug label:high"`)
  - `--milestone <name>` filter by milestone
  - `--assignee <user>` filter by assignee
  - `--limit <n>` max issues to fetch (default: 30)
  - `--repo <owner/repo>` target repository (auto-inferred from `gh repo view` if omitted)
  - `--target-upstream` derive the canonical target repository from the checkout's GitHub `upstream` remote; mutually exclusive with `--repo`
  - `--dry-run` preview triage without executing
- Build artifacts are plan-scoped under `.frankenbeast/.build/`: `<plan-name>.checkpoint` for execution state, `<plan-name>-<datetime>-build.log` for session logs (written incrementally, crash-safe), `chunk-sessions/<plan>/<chunk>.json` for canonical chunk execution state, and `chunk-session-snapshots/<plan>/<chunk>/...json` for pre-compaction rollback points. Different plans have independent checkpoints and log histories.
- `dep-factory.ts` calls `createBeastDeps()` which wires real consolidated adapters for all module ports: `MiddlewareChainFirewallAdapter` (firewall), `SqliteBrainMemoryAdapter` (memory), `SkillManagerAdapter` (skills), `ReflectionHeartbeatAdapter` (heartbeat), `AuditTrailObserverAdapter` (observer). Falls back to passthrough stubs only when `createBeastDeps()` throws (e.g., no providers configured).
- `ProviderRegistryIAdapter` bridges `ProviderRegistry.execute()` (async generator) to `IAdapter` (Promise), with `MiddlewareChain` applied on request/response. Active in the heartbeat/reflection LLM path.
- `SkillConfigStore` persists enabled-skill state to `.frankenbeast/config.json`.
- `OrchestratorConfigSchema` accepts `security`, `brain`, and `consolidatedProviders` fields from config files, threaded through `dep-bridge.ts` → `createBeastDeps()`.
- `run.ts` surfaces `skillManager`, `providerRegistry`, and `dashboardDeps` from `createCliDeps()` into `startChatServer()`, activating `/api/skills` and `/api/dashboard` routes.

## Build & Test

All commands run via Turborepo for dependency-ordered builds and parallel testing:

```bash
npm run build        # turbo run build (dependency-ordered across all packages)
npm test             # turbo run test (parallel across all packages)
npm run typecheck    # turbo run typecheck
```

Per-package: `npx turbo run test --filter=franken-brain`

Most packages build with `tsc`; `franken-web` uses `tsc && vite build`.

## Project Config

- **TypeScript**: ES2022, Node.js native ESM, strict mode, path aliases (`@franken/types`, etc.)
- **Test framework**: Vitest
- **HTTP framework**: Hono (orchestrator, comms, governor services)
- **Validation**: Zod v3
- **Docker**: docker-compose.yml for ChromaDB, Grafana, Tempo

## Type Safety Conventions

- Branded IDs everywhere: `TaskId`, `ProjectId`, `SessionId`, `RequestId`, `SpanId`, `TraceId`
- `Result<T, E>` monad for expected failures
- Zod schemas at system boundaries (config, CLI args, LLM responses)
- Discriminated unions for state machines (CritiqueLoopResult: pass | fail | halted | escalated)

## Known Limitations

1. **ProviderRegistry only active in reflection path**: Task execution flows through `CliLlmAdapter → MartinLoop → spawn()`. Multi-provider failover applies to heartbeat/reflection calls only. By design — middleware applies to in-process prompt text, not subprocess stdio.
2. **SkillManagerAdapter.execute() and McpSdkAdapter.callTool() are stubs**: Return hardcoded strings. Real MCP tool dispatch is a future effort.
3. **No `--non-interactive` flag**: Headless usage relies on starting at `plan` or `run` with existing inputs.
4. **Provider/dashboard CLI commands are stubs**: `frankenbeast provider` and `frankenbeast dashboard` print instructions but don't execute.
5. **`--resume` parsed but not a distinct control path**: Checkpoint-based task skipping works from existing checkpoint files.

## Key Documentation

| File | Content |
|------|---------|
| `docs/ARCHITECTURE.md` | Full system overview with Mermaid diagrams |
| `docs/PROGRESS.md` | PR-by-PR progress tracking, verified test counts, and Phase 8 CLI gap-closure work |
| `docs/adr/` | ADRs covering monorepo structure, hex architecture, Hono, shared types, Beast Loop, circuit breakers, CLI execution, Approach C, pluggable CLI providers, multi-pass planning, chat dispatch, external comms, network operator control plane, and tracked-agent init workflow |
| `docs/guides/` | quickstart, run-dashboard-chat, add-llm-provider, wrap-external-agent, fix-github-issues |
| `docs/plans/` | Design docs and implementation plans (MCP, beast-runner, approach-c, CLI E2E, pluggable providers, interview UX, etc.) |

## Secret Store

- **4 backends** selectable via `network.secureBackend`: `os-keychain`, `1password`, `bitwarden`, `local-encrypted`
- All backends implement the `ISecretStore` interface (`get(key)`, `set(key, value)`, `delete(key)`, `has(key)`)
- The config file stores **logical keys** (e.g. `frankenbeast/operator-token`), never secret values
- `SecretResolver` runs at boot in the network supervisor — resolves all `*Ref` fields from `ISecretStore` into `ResolvedSecrets` injected into service dependencies
- `frankenbeast init` generates the operator token and writes it to the backend
- `FRANKENBEAST_PASSPHRASE` env var enables headless decryption with `local-encrypted` backend (CI/CD)
- See [ADR-018](adr/018-secret-store-architecture.md) for design rationale

## Development Practices

- **TDD**: Red → Green → Refactor. Tests before implementation.
- **Tracer bullets**: Thin end-to-end slice first, flesh out later.
- **Atomic commits**: One logical change per commit.
- **ADRs**: Document all non-obvious architectural decisions.
- **Single repo**: `git clone` gets everything — all packages in one repository
- **Martin workflow**: Automated loop — chunks → impl loop → harden loop → merge → verify
