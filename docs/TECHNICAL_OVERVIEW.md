# Frankenbeast: Technical Overview

> A deterministic guardrails framework for AI agents.

## What It Is

Frankenbeast is a modular framework that wraps AI coding agents (Claude, Codex, Gemini, Aider) with deterministic safety controls. Instead of trusting the model to self-regulate, Frankenbeast enforces budgets, validates outputs, gates dangerous actions through human approval, and provides full cost/token observability — all through a pipeline that the agent cannot bypass.

The system is organized as a 13-package TypeScript monorepo using npm workspaces and Turborepo, built on hexagonal (ports-and-adapters) architecture. Each module exposes port interfaces consumed by the central orchestrator, allowing modules to be swapped, stubbed, or upgraded independently.

## Who This Is For

Frankenbeast targets **developers and teams running AI coding agents in production** who need:

- Hard budget limits — not "please try to stay under $5," but actual circuit breakers that halt execution
- Audit trails — every LLM call traced with cost, latency, and token count
- Crash recovery — long-running agent tasks that survive process restarts and provider switches
- Provider flexibility — switch between Claude, Codex, Gemini without rewriting agent logic

It is not a hosted service, a no-code platform, or an agent framework itself. It wraps existing agents with controls they cannot bypass.

### Use Cases

1. **Automated issue fixing with budget caps** — `frankenbeast issues --label bug` fetches GitHub issues, triages by severity, fixes them with LLM agents, creates PRs, and halts if the token budget is exceeded.

2. **Design-to-implementation pipeline** — Feed a design doc, get chunk decomposition, execute each chunk with crash recovery and git branch isolation per chunk.

3. **Multi-provider fallback** — Primary provider rate-limited? Automatically cascade to the next provider in the chain without losing session state.

## Current Status

Frankenbeast is a **partially-integrated** guardrails framework. Of its 8 core modules:

- **1 is fully wired** into the CLI execution path — Observer (real-time cost tracking, token counting, budget enforcement, loop detection)
- **2 can be dynamically enabled** but default to stubs — Firewall, Critique
- **5 are stubbed** in the CLI path — Memory, Planner, Governor, Heartbeat, Skills

The CLI pipeline executes real LLM work with real cost tracking, crash recovery, git branch isolation, and provider fallback. But critique, governance, memory, and reflection do not participate by default. The guardrails framework currently guards with the observer, circuit breakers, and git isolation — not with the full module pipeline.

**What this means concretely:**
- The critique loop — arguably the most valuable safety feature — does not run by default
- Human-in-the-loop governance auto-approves everything in CLI mode
- Memory never hydrates; the agent starts fresh every time despite a full memory system existing
- No real LLM calls in the test suite (standard practice, but integration with actual APIs is validated manually only)
- The Zod version split (v3 vs v4 across modules) is unresolved technical debt

**What this project does demonstrate well:**
- Hexagonal architecture applied consistently across 13 packages, proven by real module swaps (observer stub → real CliObserverBridge, planner → LlmGraphBuilder) — not hypothetical
- 2,567 tests with meaningful coverage (though see Test Suite section for honest per-package breakdown)
- Real end-to-end execution — actual LLM calls, USD cost tracking, crash recovery, provider fallback
- Pluggable provider system across 4 AI vendors with automatic rate-limit cascading
- 18 ADRs documenting the "why" behind every non-obvious decision

**In short:** The architecture and individual modules are solid. The wiring is not. This is a framework that has proven its pieces work in isolation and has a clear path to full integration, but has not yet walked that path.

## Architecture

### Current CLI Path (what actually runs today)

```
User Input
    │
    ▼
┌────────────────────────────────────────────────────────┐
│                    BEAST LOOP                          │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ Ingestion│→ │ Planning │→ │Execution │→ │Closure│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──┬────┘ │
│       │              │             │            │      │
│   [stub]        LlmGraph      CliSkill     Observer   │
│                  Builder      Executor      [ACTIVE]  │
│               [real LLM]    [real LLM]    real cost,  │
│                             MartinLoop    tokens, USD  │
│                             GitIsolator   budget halt  │
│                                                        │
│  ─ Circuit Breakers [ACTIVE] ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  injection detection │ budget enforcement              │
└────────────────────────────────────────────────────────┘
    │
    ▼
BeastResult (traces, cost, outputs, PR)
```

### Target Architecture (not yet wired)

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    BEAST LOOP                           │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Ingestion│→ │ Planning │→ │Execution │→ │Closure │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │             │             │      │
│   Firewall       Planner       Skills       Observer   │
│   Memory         Critique      Governor     Heartbeat  │
│                                MCP                     │
│                                                        │
│  ─ ─ ─ Circuit Breakers ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  injection detection │ budget enforcement │ critique    │
│  spiral detection                                      │
└────────────────────────────────────────────────────────┘
    │
    ▼
BeastResult (traces, cost, outputs, PR)
```

### The 12 Framework Packages

This table uses a 3-tier status vocabulary:

| Status | Meaning |
|--------|---------|
| **Wired** | Code exists, tests pass, actively participates in CLI execution |
| **Library-complete** | Code exists, tests pass, not wired into any execution path |
| **Stub** | Interface defined, implementation is placeholder or minimal |

| Package | Role | Status |
|---------|------|--------|
| **franken-observer** | Tracing, cost tracking, circuit breakers, eval framework | **Wired.** OTEL-based tracing, real USD cost calculation, token counting, budget enforcement, loop detection. Export adapters for SQLite, Langfuse, Prometheus, Grafana/Tempo. |
| **frankenfirewall** | LLM proxy — injection scanning, PII masking, response validation | **Library-complete** (dynamic import can enable). Claude, OpenAI, Ollama adapters production-ready. Gemini/Mistral adapters are stubs. Deployable as standalone Hono service. |
| **franken-brain** | Working + episodic + semantic memory with PII guards | **Library-complete.** SQLite-backed episodic store, Chroma vector DB for semantic retrieval, LLM-powered compression. Not wired — stubbed to return empty context. |
| **franken-planner** | DAG-based task planning with chain-of-thought gates | **Library-complete** (bypassed by LlmGraphBuilder). Plan creation, dependency management, toposort, HITL approval, recovery. |
| **franken-critique** | Self-critique pipeline with 8 deterministic evaluators | **Library-complete** (dynamic import can enable). Safety, ghost dependency, logic loop, factuality, conciseness, complexity, scalability, ADR compliance evaluators. |
| **franken-governor** | Human-in-the-loop approval gating | **Library-complete** (designed for service mode). Budget/skill/confidence/ambiguity triggers, CLI/Slack/Discord approval channels, webhook receiver, audit trails. |
| **franken-heartbeat** | Reflection engine, morning briefs, tech debt tracking | **Library-complete.** Deterministic checker (git/tests/types), LLM-powered reflection, morning brief builder. |
| **franken-skills** | Skill registry and discovery | **Stub.** Registry interfaces defined, file-based discovery works, MCP constraint resolution wired. Execution goes through CliSkillExecutor, not this module's interface. |
| **franken-types** | Shared branded IDs, Result monad, Severity, ILlmClient | Complete. Pure types and utilities. |
| **franken-mcp** | Model Context Protocol client and registry | Library-complete. JSON-RPC over stdio, tool discovery, constraint-aware execution. |
| **franken-comms** | External communications — Slack, Discord, Telegram, WhatsApp | Library-complete. Signature verification for all platforms. Not integrated into CLI path. |
| **franken-orchestrator** | The Beast Loop, CLI, chat server, skill execution, crash recovery | **Wired.** Core of the system. 1,018 tests. |

> A React development dashboard (`franken-web`) provides a chat UI and beast dispatch controls for local development. It is not part of the guardrails framework and is not covered in this overview.

### What Actually Runs End-to-End

The CLI pipeline (`frankenbeast` command) executes real work through:

- **CliLlmAdapter** — wraps any ICliProvider for single-shot LLM completions
- **CliSkillExecutor** — spawns CLI AI tools as child processes for multi-iteration tasks
- **MartinLoop** — core execution loop with canonical session state, context compaction at 85% usage, provider fallback on rate limits, crash recovery via snapshots
- **CliObserverBridge** — real token counting, USD cost tracking, budget enforcement
- **GitBranchIsolator** — feature branch per chunk, auto-commit, merge back
- **FileCheckpointStore** — plan-scoped crash recovery

### Provider Support

The CLI supports multiple AI agent providers via `--provider` and `--providers` (fallback chain). CLI providers and firewall adapters are independent layers — a provider can execute tasks without the firewall proxy being wired for that provider.

| Provider | CLI Execution (CliSkillExecutor) | Firewall Adapter (standalone proxy) |
|----------|--------------------------------|-------------------------------------|
| Claude | Full | Full |
| OpenAI/Codex | Full | Full |
| Ollama | N/A (local models) | Full |
| Gemini | Full | Stub (throws "Not implemented") |
| Aider | Full | N/A (LiteLLM handles routing) |
| Mistral | N/A | Stub (throws "Not implemented") |

Claude is the primary and most tested provider. Gemini and Aider work for CLI execution but lack firewall proxy adapters.

### Hexagonal Architecture in Practice

The port-and-adapter pattern has been validated by real substitutions, not hypothetical swaps:

1. **Observer: stub → real** — The observer started as a stub returning empty spans. `CliObserverBridge` replaced it with real token counting, cost tracking, and budget enforcement. No orchestrator code changed — only `dep-factory.ts` wiring.

2. **Planner: module → alternative** — `franken-planner` was designed for the planning phase but `LlmGraphBuilder` replaced it for CLI use. The orchestrator's `IGraphBuilder` port accepted both without modification.

3. **Providers: single → pluggable** — CLI execution originally hardcoded Claude. `ProviderRegistry` + `ICliProvider` interface now supports 4 providers with runtime selection. MartinLoop cascades through providers on rate limits without code changes.

Any module can be swapped by changing its factory in `dep-factory.ts`:

```typescript
// Before (stub):
const critique = stubCritique;

// After (real):
const { createCritiqueModule } = await import('@frankenbeast/critique');
const critique = createCritiqueModule({ evaluators: defaultEvaluators, maxIterations: 3 });
```

The orchestrator doesn't know or care which implementation it received. Both satisfy `ICritiqueModule`.

### What Is Stubbed in the CLI Path

The following modules have full standalone implementations but are **not wired** into the default CLI execution path. The orchestrator's `dep-factory.ts` uses stubs:

| Module | Stub behavior | Why |
|--------|--------------|-----|
| Memory | Returns empty context | Dynamic import exists but falls back to stub |
| Planner | Throws "not available" | Bypassed by LlmGraphBuilder |
| Critique | Returns `pass` | Dynamic import exists but defaults to stub |
| Governor | Returns `approved` | Designed for service mode, not CLI |
| Heartbeat | Returns empty improvements | Post-execution reflection, not wired into main loop |
| Firewall | Falls back to stub | Dynamic import exists but falls back |

**This means**: In the current CLI path, there is no memory hydration, no critique loop, no human approval gates, no reflection. The guardrails that are active are: observer budget enforcement, circuit breakers (injection/budget/critique-spiral), and git isolation.

## CLI Capabilities

```
frankenbeast                        # Full interactive flow (interview → plan → execute)
frankenbeast interview              # Interactive requirements gathering
frankenbeast plan --design-doc <f>  # Design doc → chunk decomposition
frankenbeast run                    # Execute chunks with real LLM calls
frankenbeast issues --label bug     # Fetch GitHub issues, triage, auto-fix
frankenbeast chat                   # Two-tier interactive REPL
frankenbeast chat-server            # HTTP + WebSocket for dashboard
frankenbeast beasts catalog         # List beast definitions
frankenbeast beasts spawn <id>      # Dispatch beast runs
frankenbeast network up             # Start managed services
frankenbeast init                   # Guided configuration setup
```

## Test Suite

2,567 tests across 237 test files. All passing. But that number deserves scrutiny.

### By what they actually prove

| Category | Tests | What they prove |
|----------|-------|-----------------|
| Module logic (standalone) | ~1,200 | Individual module internals work in isolation |
| Orchestrator CLI pipeline | ~650 | CLI execution, session mgmt, issue pipeline work with real observer, fake everything else |
| Orchestrator E2E (full loop) | ~50 | Beast Loop phases run correctly against in-memory ports |
| Cross-package contracts | ~162 | Port interfaces are compatible across packages |
| Conformance suites | ~30 | Adapter implementations satisfy shared interface contracts |
| Stub-only paths | ~475 | Code paths that exercise stubs (governor auto-approve, critique auto-pass, etc.) |

### By guardrail coverage

| Guardrail | Tested with real impl | Tested against stub |
|-----------|----------------------|---------------------|
| Observer / budget enforcement | ~1,400 | ~200 |
| Injection detection | ~200 | ~2,300 |
| Critique loop | ~146 (critique pkg only) | ~2,400 |
| Governor approval | ~136 (governor pkg only) | ~2,400 |
| Memory hydration | ~175 (brain pkg only) | ~2,350 |

Zero orchestrator tests run with critique, governor, or memory active. Those guardrails are tested only inside their own packages.

### Per-package breakdown

| Package | Tests | Assessment |
|---------|-------|-----------|
| franken-orchestrator | 1,018 | High quality — unit, integration, E2E with fake adapters. Tests real CLI execution, session management, issue pipeline, but all guardrail modules are stubbed. |
| franken-observer | 373 | High quality — real tracing, cost calc, evals, incident detection |
| franken-planner | 188 | High quality — real DAG operations, CoT gates, recovery |
| franken-brain | 175 | High quality — real memory operations (working, episodic, semantic, compression) |
| root integration | 162 | Medium — cross-package contract tests |
| frankenfirewall | 163 | High quality — conformance suite + real adapter logic |
| franken-critique | 146 | High quality — real evaluator logic, loop, breakers |
| franken-governor | 136 | High quality — trigger + webhook integration |
| franken-heartbeat | 118 | Medium — real reflection engine, but no integration testing |
| franken-mcp | 85 | High quality — real MCP protocol, JSON-RPC, constraint resolution |
| franken-skills | 75 | Medium — mostly mocks and interface stubs |
| franken-comms | 36 | Real adapter tests with signature verification |
| franken-types | 22 | Pure utility tests |

All tests use dependency injection with mock/fake implementations. No real API keys required. E2E tests use `FakeLlmAdapter` and in-memory ports. No real LLM calls in the test suite — integration with actual LLM APIs is validated manually.

## Technical Decisions

18 Architecture Decision Records document choices including:

- Hexagonal architecture with port interfaces (allows module stubbing/swapping)
- Hono for HTTP services (firewall, critique, governor deployable as standalone services)
- Pluggable CLI providers via ProviderRegistry (not hardcoded to one AI tool)
- Approach C: 3 input modes (chunks / design-doc / interview) unified into PlanGraph → execute
- MartinLoop for multi-iteration chunk execution with context compaction
- Canonical chunk session state for provider-agnostic crash recovery
- Tracked-agent lifecycle sitting above Beast runs

## What's Not Done

From the incomplete plans reconciliation (as of March 2026):

**Not started:**
- Critique + Governor wiring into CLI path (draft designs exist, no implementation)
- Heartbeat wiring into CLI path (draft design exists, depends on above)
- Plan critique system (no IPlanEvaluator implementation)
- `frankenbeast work` subcommand
- LLM error awareness memory injection
- File store integrations (Google Drive, Dropbox, S3)
- Productivity integrations (Google Sheets, Calendar, Gmail)

**Partially done:**
- Dashboard agent configuration (~60% — toggles work, settings pages missing)
- Issues provider fallback (~70% — CliLlmAdapter has it, triage/decomp paths don't)
- Unified issue pipeline (~40% — transcript pruning, context compaction not implemented)

## Development Practices

- **TDD**: Red → Green → Refactor for all features
- **Tracer bullets**: Thin end-to-end slice first, then flesh out
- **Atomic commits**: One logical change per commit
- **ADRs**: All non-obvious decisions documented
- **Martin workflow**: Automated chunk execution loop for implementation plans

## Stack

- TypeScript (ES2022, strict mode, Node.js native ESM)
- Vitest for testing
- Hono for HTTP services
- Zod for validation (v3 most modules; heartbeat uses v4)
- Turborepo for monorepo build orchestration
- SQLite (better-sqlite3) for episodic memory and trace storage
- ChromaDB for semantic vector retrieval
- Docker Compose for local dev (ChromaDB, Grafana, Tempo)

---

*Frankenbeast v0.21.0 — [github.com/djm204/frankenbeast](https://github.com/djm204/frankenbeast)*
