# CLAUDE.md - franken-observer (MOD-05)

## Project Identity

**franken-observer** is MOD-05 of the Frankenbeast system — the "Flight Data Recorder."
It captures every trace, monitors token burn-rates in real-time, and runs Agent Evals
to ensure code refactors don't break established skills.

**Package name:** `@frankenbeast/observer`
**Role in Frankenbeast:** Observability layer consumed by MOD-04 (Planner) and all adapters from MOD-01.

---

## Tech Stack

| Concern        | Choice                              | Notes                                  |
|----------------|-------------------------------------|----------------------------------------|
| Language       | TypeScript (strict)                 | Target ES2022, `moduleResolution: NodeNext` |
| Runtime        | Node.js 20+                         |                                        |
| Test runner    | Vitest                              | TDD-first; co-locate `*.test.ts` files |
| Build          | tsc                                 | ESM output                             |
| OTEL           | `@opentelemetry/api` + `@opentelemetry/sdk-node` | Core instrumentation      |
| SQLite         | `better-sqlite3`                    | Zero-dep local dev backend             |
| HTTP exports   | `ofetch`                            | Langfuse / Phoenix adapter calls       |

---

## Core Concepts & Terminology

| Term               | Definition                                                                 |
|--------------------|----------------------------------------------------------------------------|
| **Root Trace**     | Top-level unit tied to a single user goal                                  |
| **Span**           | One step taken by MOD-04 Planner                                           |
| **Sub-Span**       | A single tool call (`@djm204/agent-skills`) or LLM adapter call (MOD-01)  |
| **Thought Block**  | Captured reasoning/intermediate output attached as span metadata           |
| **Circuit Breaker**| Budget guard that pauses execution and fires a HITL alert at a cost limit  |
| **Golden Trace**   | A recorded successful trace used as a regression baseline                  |
| **Post-Mortem**    | Markdown report auto-generated when an agent loop is detected + interrupted|

---

## Architectural Constraints

- **OTEL-first:** All internal trace data must be serialisable to OTEL format.
  Backends are pluggable adapters, never hard-coded.
- **Zero mandatory side-effects at import time.** The SDK must be safe to import
  in tests without starting servers or opening DB connections.
- **Async-safe:** Circuit breaker and loop-detector must be non-blocking;
  they emit events, they don't throw mid-trace.
- **Model-agnostic cost table:** Pricing lives in a config object, never
  hard-coded strings. Supports Claude, GPT-4o, and extensible to others.

---

## Development Workflow

### Methodology

- **TDD:** Write the failing test first, then the minimum implementation.
- **Tracer Bullets:** Build one thin end-to-end slice per feature branch before
  adding breadth. E.g. for tracing: root-trace → span → SQLite export works
  before adding metadata, thought blocks, or HTTP adapters.
- **Atomic Commits:** Each commit should be a single logical change and pass
  `vitest run`. Format: `type(scope): description` (conventional commits).
- **Feature Branches (FB):** One FB per feature area (see IMPLEMENTATION_PLAN.md).
  FBs are squash-merged via PR once green.

### Commit Types

`feat` `fix` `test` `refactor` `chore` `docs` `perf`

### Branch Naming

`feat/<fb-id>-<slug>` e.g. `feat/fb-01-core-tracing`

### PR Rules

- Every PR must have passing tests and no TS errors (`tsc --noEmit`).
- PRs group one or two related FBs; never mix unrelated concerns.
- Include a brief "Tracer Bullet Verified" note in PR description confirming
  end-to-end path works before extras were added.

---

## Testing Strategy

- **Unit tests** (`.test.ts`): Pure functions, data models, serialisers. No I/O.
- **Integration tests** (`.integration.test.ts`): SQLite backend, real OTEL pipeline.
  Run with `INTEGRATION=true vitest run`.
- **Eval tests** (`.eval.test.ts`): LLM-as-a-Judge; gated behind `EVAL=true`.
  Not run in CI by default to avoid cost.
- **Golden Trace fixtures** live in `tests/fixtures/golden/`.

---

## Directory Layout (target)

```text
src/
  core/          # Trace/Span data models, TraceContext, SpanLifecycle
  cost/          # TokenCounter, CostCalculator, CircuitBreaker
  evals/         # EvalRunner, deterministic evals, LLM-judge evals
  export/        # OTEL serialiser, adapter interface
  adapters/      # sqlite/, langfuse/, prometheus/
  incident/      # LoopDetector, InterruptEmitter, PostMortemGenerator
  index.ts       # Public API re-exports
tests/
  fixtures/
    golden/      # Golden Trace JSON files for regression evals
```

---

## Installed Rule Templates

- **Shared**: Core principles, code quality, security, git workflow, communication
- **javascript-expert**: Principal-level TS/Node.js engineering
- **testing**: TDD, test design, CI/CD integration
- **qa-engineering**: Quality gates, metrics, automation
- **ml-ai**: Model monitoring, evaluation, security

All rules are in `.cursor/rules/` and are read automatically.

Re-install: `npx @djm204/agent-skills javascript-expert testing qa-engineering ml-ai`
