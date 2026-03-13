# Frankenbeast — Implementation Plan

> **Status: ALL PHASES COMPLETE.** 42 PRs across 7 phases, 1,572 tests passing.
> See [docs/PROGRESS.md](docs/PROGRESS.md) for the detailed PR-by-PR breakdown.

## Mission

Frankenbeast is a **deterministic guardrails framework for AI agents**. It exists because LLM-based agents routinely lose safety constraints when context windows compress, hallucinate tool calls that violate architectural rules, and take destructive actions without human oversight.

Frankenbeast solves this by enforcing safety **outside** the LLM's context window through deterministic verification at every stage of the agent lifecycle: ingestion, planning, execution, and closure. Every check that *can* be deterministic *is* deterministic. LLM reasoning is only used where it is unavoidable (plan generation, summarisation), and even then it is audited by deterministic critique before being trusted.

### Core Principles

- **Determinism over probabilism.** Regex-based injection scanning, schema validation, dependency whitelisting, DAG cycle detection, HMAC signature verification — these do not hallucinate.
- **LLM-agnostic.** The firewall (MOD-01) is a Model-Agnostic Proxy. Adapters exist for Claude, OpenAI, and Ollama. Adding any provider means implementing a single `IAdapter` interface.
- **Immutable safety constraints.** Guardrails live in the firewall pipeline, not in the LLM prompt. They cannot be compressed, summarised, or forgotten.
- **Human-in-the-loop as a first-class primitive.** High-stakes actions require cryptographically signed human approval via MOD-07 before execution.
- **Full auditability.** Every decision — plan, critique, approval, tool call, failure — is traced, costed, and exportable to OTEL/Langfuse/Prometheus/Tempo.
- **Guardrails as a service.** The firewall, critique, and governor modules are deployable as standalone HTTP services to wrap *any* agent framework.

### Architectural Note: Independent Repos

Each of the 10 modules is its own git repository with independent versioning, CI, and release lifecycle. The orchestrator consumes them via port/adapter interfaces. PRs are scoped to a single repo unless explicitly noted.

---

## Current State

| # | Module | Tests | Status |
|---|--------|-------|--------|
| 01 | frankenfirewall | 163 | Complete — Claude, OpenAI, Ollama adapters; conformance suite; Hono server; Docker |
| 02 | franken-skills | 75 | Complete — skill registry, discovery service, Zod validation |
| 03 | franken-brain | 166 | Complete — working, episodic, semantic memory; PII guards |
| 04 | franken-planner | 188 | Complete — DAG builder, 3 strategies, CoT gates |
| 05 | franken-observer | 373 | Complete — tracing, cost tracking, evals, export adapters |
| 06 | franken-critique | 146 | Complete — 8 evaluators, circuit breakers, Hono server |
| 07 | franken-governor | 136 | Complete — triggers, approval gateway, Hono server |
| 08 | franken-heartbeat | 118 | Complete — pulse orchestrator, reflection, morning briefs |
| — | franken-types | 22 | Complete — shared TaskId, Severity, Result, RationaleBlock |
| — | franken-orchestrator | 132 (99 unit + 33 E2E) | Complete — Beast Loop, circuit breakers, resilience, CLI |
| — | Root integration | 53 | Complete — cross-module contracts, E2E beast loop |
| | **Total** | **1,572** | **All passing** |

---

## Phase 1: Stabilise Individual Modules — COMPLETE

14 PRs (PR-01 through PR-14), each targeting a single module repo. Brought the project from partial implementations to 971+ tests across all 8 modules.

| PR | Module | What was done |
|----|--------|--------------|
| PR-01 | franken-brain | Working Memory unit tests |
| PR-02 | franken-brain | Compression strategy tests (LLM summarisation, episodic lesson extraction) |
| PR-03 | franken-brain | Episodic & Semantic store tests (SQLite, ChromaDB mocks) |
| PR-04 | franken-brain | PII guards, MemoryOrchestrator tests, barrel exports |
| PR-05 | franken-heartbeat | Checklist parser/writer, DeterministicChecker tests |
| PR-06 | franken-heartbeat | ReflectionEngine, PromptBuilder, ResponseParser, MorningBriefBuilder tests |
| PR-07 | franken-heartbeat | PulseOrchestrator, CLI args tests |
| PR-08 | franken-critique | All 8 evaluator unit tests, CritiquePipeline ordering |
| PR-09 | franken-critique | Circuit breakers, CritiqueLoop, LessonRecorder tests |
| PR-10 | franken-governor | Trigger evaluators, SignatureVerifier, SessionTokenStore tests |
| PR-11 | franken-governor | ApprovalGateway, CliChannel, GovernorCritiqueAdapter tests |
| PR-12 | franken-planner | Public API wired in barrel export, edge-case DAG tests |
| PR-13 | frankenfirewall | Barrel fix, runPipeline integration tests |
| PR-14 | franken-skills | Registry integration verification |

---

## Phase 2: LLM-Agnostic Adapter Layer — COMPLETE

4 PRs (PR-15 through PR-18). Formalised the provider-agnostic adapter contract, added Ollama adapter, and verified all LLM-consuming modules are provider-agnostic.

| PR | Module | What was done |
|----|--------|--------------|
| PR-15 | frankenfirewall | `runAdapterConformance()` test harness validating all 4 `IAdapter` methods |
| PR-16 | frankenfirewall | `OllamaAdapter` (maps to `POST /api/chat`, zero cost for local models), Gemini/Mistral stubs |
| PR-17 | franken-brain | 3 mock LLM implementations proving `ILlmClient` is provider-agnostic |
| PR-18 | franken-heartbeat | Multiple mock implementations proving `Result<string>` return type works uniformly |

---

## Phase 3: Inter-Module Contracts — COMPLETE

6 PRs (PR-19 through PR-24). Created shared types package and migrated all modules to use canonical type definitions.

| PR | Module | What was done |
|----|--------|--------------|
| PR-19 | Root repo | `CONTRACT_MATRIX.md` documenting 18+ port interfaces, `expectTypeOf` assignability tests |
| PR-20 | franken-types (new) | Shared package: branded `TaskId`/`ProjectId`/`SessionId`, `Severity` superset, `RationaleBlock`, `VerificationResult`, `ILlmClient`, `IResultLlmClient`, `Result<T,E>`, `TokenSpend`, `FrankenContext` Zod schema |
| PR-21 | franken-critique | Re-export `Verdict`, `CritiqueSeverity`, `TaskId` from `@franken/types`; import `TokenSpend` |
| PR-22 | franken-governor | Remove local `RationaleBlock`/`VerificationResult`, import from `@franken/types` |
| PR-23 | franken-planner | Re-export `TaskId`, `createTaskId`, `RationaleBlock`, `VerificationResult` from `@franken/types` |
| PR-24 | franken-heartbeat | Import `Result` from `@franken/types`, re-alias `IResultLlmClient` as `ILlmClient` |

**Type mismatches resolved:**
1. TaskId branding — canonical in `@franken/types`
2. Severity scale — superset with module-specific subsets
3. RationaleBlock — canonical in `@franken/types`
4. ILlmClient — `ILlmClient` + `IResultLlmClient` in `@franken/types`
5. EpisodicTrace — kept as local projections per module (different fields needed)
6. Zod version split — still divergent (heartbeat `zod/v4`, critique `zod` 3.24)

---

## Phase 4: The Orchestrator ("The Beast Loop") — COMPLETE

6 PRs (PR-25 through PR-30). Built the orchestrator as a new module wiring all 8 modules into a 4-phase pipeline.

| PR | Module | What was done |
|----|--------|--------------|
| PR-25 | franken-orchestrator (new) | Package scaffold, Zod-validated `OrchestratorConfig`, `BeastContext`, `BeastLoopDeps` |
| PR-26 | franken-orchestrator | Ingestion (firewall sanitization, `InjectionDetectedError`) + Hydration (memory frontload) |
| PR-27 | franken-orchestrator | Planning with critique loop (max N iterations), `CritiqueSpiralError` on exhaustion |
| PR-28 | franken-orchestrator | Topological task execution with HITL governor check, observer span tracking |
| PR-29 | franken-orchestrator | Closure — token spend, optional heartbeat pulse, `BeastResult` assembly |
| PR-30 | franken-orchestrator | Circuit breakers: injection (immediate halt), budget (HITL escalation), critique spiral (HITL escalation). `BeastLoop` class wiring all 4 phases. |

---

## Phase 5: Guardrails as a Service — COMPLETE

5 PRs (PR-31 through PR-35). Three modules deployed as standalone Hono HTTP servers. Ran in parallel with Phases 3-4.

| PR | Module | What was done |
|----|--------|--------------|
| PR-31 | frankenfirewall | Hono server: `POST /v1/chat/completions` (OpenAI-compatible), `POST /v1/messages` (Anthropic), `GET /health`. Request ID middleware, error handler. |
| PR-32 | frankenfirewall | Multi-stage Node 22 Alpine Dockerfile, docker-compose |
| PR-33 | Root repo | OpenClaw integration example (docker-compose + guardrails.config.json) |
| PR-34 | franken-critique | Hono server: `POST /v1/review` wired to `CritiquePipeline`, bearer auth, rate limiter |
| PR-35 | franken-governor | Hono server: `POST /v1/approval/request`, `POST /v1/approval/respond`, `POST /v1/webhook/slack`, HMAC signature verification |

**Decisions made:**
- HTTP framework: **Hono** (lightweight, `app.request()` for testing without spinning up server)
- Protocol: **REST** (OpenAI-compatible proxy for firewall)

---

## Phase 6: End-to-End Testing & Hardening — COMPLETE

4 PRs (PR-36 through PR-39). Full E2E test suite with in-memory port implementations and resilience features.

| PR | Module | What was done |
|----|--------|--------------|
| PR-36 | franken-orchestrator | `FakeLlmAdapter` (pattern-to-response, call tracking, latency/error injection), `InMemory*` ports for all 8 modules, `createTestOrchestrator()` factory, 3 smoke tests |
| PR-37 | franken-orchestrator | E2E: happy path (8 tests), PII scrubbing (4), critique retry (4) |
| PR-38 | franken-orchestrator | E2E: HITL pause (4), budget exceeded (3), injection midflow (4), self-correction (3) |
| PR-39 | franken-orchestrator | `ContextSerializer` (crash recovery), `GracefulShutdown` (SIGTERM/SIGINT), `ModuleInitializer` (health checks) |

---

## Phase 7: CLI & Developer Experience — COMPLETE

3 PRs (PR-40 through PR-42). CLI entry point, local dev environment, and documentation.

| PR | Module | What was done |
|----|--------|--------------|
| PR-40 | franken-orchestrator | `parseArgs` (node:util), `loadConfig` (CLI > env > file > defaults), `run.ts` entry point with `--dry-run` and `--resume` |
| PR-41 | Root repo | Docker Compose (ChromaDB, Grafana, Tempo), `.env.example`, seed + verify scripts |
| PR-42 | Root repo | Quickstart guide, add-LLM-provider guide, wrap-external-agent guide, 6 ADRs, ARCHITECTURE.md update |

---

## PR Dependency Graph (as executed)

```
PHASE 1 — All parallel, each in its own repo
  PR-01 -> PR-02 -> PR-03 -> PR-04  (franken-brain, sequential within)
  PR-05 -> PR-06 -> PR-07           (franken-heartbeat, sequential within)
  PR-08 -> PR-09                    (franken-critique)
  PR-10 -> PR-11                    (franken-governor)
  PR-12                             (franken-planner)
  PR-13                             (frankenfirewall)
  PR-14                             (franken-skills)

PHASE 2 — After Phase 1
  PR-15 -> PR-16                    (frankenfirewall)
  PR-17                             (franken-brain, parallel with 15)
  PR-18                             (franken-heartbeat, parallel with 15, 17)

PHASE 3 — After Phase 2
  PR-19                             (root repo)
  PR-19 -> PR-20                    (franken-types)
  PR-20 -> PR-21                    (franken-critique)     ]
  PR-20 -> PR-22                    (franken-governor)     ] ALL PARALLEL
  PR-20 -> PR-23                    (franken-planner)      ] AFTER PR-20
  PR-20 -> PR-24                    (franken-heartbeat)    ]

PHASE 4 — After PR-20 (sequential chain)
  PR-25 -> PR-26 -> PR-27 -> PR-28 -> PR-29 -> PR-30  (franken-orchestrator)

PHASE 5 — After PR-15 (PARALLEL with Phases 3-4)
  PR-31 -> PR-32 -> PR-33          (firewall-as-a-service)
  PR-34                             (critique-as-a-service)
  PR-35                             (governor webhook)

PHASE 6 — After PR-30
  PR-36 -> PR-37 -> PR-38          (E2E tests)
  PR-36 -> PR-39                    (resilience, parallel with 37)

PHASE 7 — After PR-30
  PR-40                             (CLI, also needs PR-39)
  PR-41                             (local dev, parallel with 40)
  PR-40 + PR-41 -> PR-42           (documentation)
```

**Critical path:** PR-15 → PR-19 → PR-20 → PR-25 → PR-26 → PR-27 → PR-28 → PR-29 → PR-30 → PR-36 → PR-37 → PR-38

---

## Module Dependency Map

```
                    ┌──────────────────┐
                    │   Orchestrator   │
                    │  franken-orch.   │
                    └────────┬─────────┘
                             │ consumes all 8 + types via ports
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     ┌─────────┐      ┌──────────┐       ┌──────────┐
     │ MOD-01  │      │  MOD-04  │       │  MOD-08  │
     │Firewall │      │ Planner  │       │Heartbeat │
     └────┬────┘      └────┬─────┘       └────┬─────┘
          │                │                   │
          │         ┌──────┼───────┐    ┌──────┼───────┐
          ▼         ▼      ▼       ▼    ▼      ▼       ▼
     ┌─────────┐ ┌─────┐┌──────┐┌────┐┌────┐┌──────┐┌─────┐
     │ MOD-02  │ │MOD01││MOD-03││MOD ││MOD ││MOD-03││MOD05│
     │ Skills  │ │     ││Memory││ 06 ││ 07 ││      ││ Obs │
     └─────────┘ └─────┘└──────┘│Crit││HITL│└──────┘└─────┘
                                └──┬─┘└──┬─┘
                                   │     │
                                ┌──┼─────┼──┐
                                ▼  ▼     ▼  ▼
                             ┌──────┐ ┌──────┐
                             │MOD-03│ │MOD-05│
                             │Memory│ │ Obs  │
                             └──────┘ └──────┘

  All modules depend on: @franken/types (franken-types)
```

Leaf modules (no downstream deps): **MOD-02** (Skills), **MOD-05** (Observer)

Foundation modules: **MOD-01** (Firewall), **MOD-03** (Memory)

Standalone-deployable as HTTP services: **MOD-01** (firewall proxy), **MOD-06** (critique endpoint), **MOD-07** (governor webhook)

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| Inter-module communication | Direct function calls via port interfaces (hexagonal architecture) |
| Persistence between sessions | `ContextSerializer` saves `BeastContext` to disk; `--resume` flag restores |
| ChromaDB for local dev | Optional — Docker Compose provides it; tests use in-memory mocks |
| Standalone firewall protocol | REST via Hono (OpenAI-compatible `POST /v1/chat/completions`) |
| HTTP framework | Hono — lightweight, `app.request()` for testing |
| Orchestrator location | Separate repo: `franken-orchestrator` |

## Known Limitations

1. **`executeTask()` is stub-level** — records success without invoking real skills. Requires concrete skill implementations to wire.
2. **CLI requires `--dry-run`** — no concrete module implementations for full live execution yet.
3. **OpenClaw example uses placeholder image** — `examples/openclaw-integration/docker-compose.yml` requires user's own image.
4. **Zod version split** — heartbeat uses `zod/v4`, critique uses `zod` 3.24.x. No runtime issues but prevents sharing Zod schemas directly.
