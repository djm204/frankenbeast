# CLAUDE.md - Development Guide

This project uses AI-assisted development. Rules in `.cursor/rules/` provide guidance.

## Installed Templates

- **Shared** (always included): Core principles, code quality, security, git workflow, communication
- **javascript-expert**: Principal-level JavaScript & TypeScript engineering (Node.js, React, type system, testing)
- **qa-engineering**: Quality assurance programs for confident, rapid software delivery
- **testing**: Comprehensive testing practices (TDD, test design, CI/CD integration, performance testing)
- **web-backend**: Backend APIs and services (REST, GraphQL, microservices)

## Rule Files

All rules are in `.cursor/rules/`. The AI assistant reads these automatically.

#### Shared Rules

| Rule | Purpose |
|------|---------|
| `core-principles.mdc` | Honesty, simplicity, testing requirements |
| `code-quality.mdc` | SOLID, DRY, clean code patterns |
| `security-fundamentals.mdc` | Zero trust, input validation, secrets |
| `git-workflow.mdc` | Commits, branches, PRs, safety |
| `communication.mdc` | Direct, objective, professional |

#### Javascript-expert Rules

| Rule | Purpose |
|------|---------|
| `javascript-expert-language-deep-dive.mdc` | language deep dive guidelines |
| `javascript-expert-node-patterns.mdc` | node patterns guidelines |
| `javascript-expert-overview.mdc` | overview guidelines |
| `javascript-expert-performance.mdc` | performance guidelines |
| `javascript-expert-react-patterns.mdc` | react patterns guidelines |
| `javascript-expert-testing.mdc` | testing guidelines |
| `javascript-expert-tooling.mdc` | tooling guidelines |
| `javascript-expert-typescript-deep-dive.mdc` | typescript deep dive guidelines |

#### Qa-engineering Rules

| Rule | Purpose |
|------|---------|
| `qa-engineering-automation.mdc` | automation guidelines |
| `qa-engineering-metrics.mdc` | metrics guidelines |
| `qa-engineering-overview.mdc` | overview guidelines |
| `qa-engineering-quality-gates.mdc` | quality gates guidelines |
| `qa-engineering-test-design.mdc` | test design guidelines |
| `qa-engineering-test-strategy.mdc` | test strategy guidelines |

#### Testing Rules

| Rule | Purpose |
|------|---------|
| `testing-advanced-techniques.mdc` | advanced techniques guidelines |
| `testing-ci-cd-integration.mdc` | ci cd integration guidelines |
| `testing-overview.mdc` | overview guidelines |
| `testing-performance-testing.mdc` | performance testing guidelines |
| `testing-quality-metrics.mdc` | quality metrics guidelines |
| `testing-reliability.mdc` | reliability guidelines |
| `testing-tdd-methodology.mdc` | tdd methodology guidelines |
| `testing-test-data.mdc` | test data guidelines |
| `testing-test-design.mdc` | test design guidelines |
| `testing-test-types.mdc` | test types guidelines |

#### Web-backend Rules

| Rule | Purpose |
|------|---------|
| `web-backend-api-design.mdc` | api design guidelines |
| `web-backend-authentication.mdc` | authentication guidelines |
| `web-backend-database-patterns.mdc` | database patterns guidelines |
| `web-backend-error-handling.mdc` | error handling guidelines |
| `web-backend-overview.mdc` | overview guidelines |
| `web-backend-security.mdc` | security guidelines |
| `web-backend-testing.mdc` | testing guidelines |

## Customization

- Create new `.mdc` files in `.cursor/rules/` for project-specific rules
- Edit existing files directly; changes take effect immediately
- Re-run to update: `npx @djm204/agent-skills javascript-expert qa-engineering testing web-backend`

---

## Project: franken-heartbeat (MOD-08)

### Identity

**Module 08 — Heartbeat Loop (Proactive Reflection)** in the Frankenbeast agent system. A scheduled autonomous trigger that forces the agent to "wake up" independently of user prompts to perform self-reflection, maintenance, and proactive planning.

### Architecture

**Cheap Check → Expensive Reasoning escalation pattern (ADR-002):**

1. **Pulse Trigger** — cron job or manual CLI invocation
2. **Deterministic Check ("Cheap")** — scan HEARTBEAT.md, check git/CI status, check token spend. Zero LLM tokens.
3. **Self-Reflection ("Expensive")** — if flags found, query memory/observability, call LLM for analysis
4. **Action/Reporting** — generate morning brief, propose skill improvements, inject planner tasks

### Integration Points

| Module | Interface | Purpose |
|--------|-----------|---------|
| MOD-03 (Memory) | `IMemoryModule` | Query episodic traces, record lessons |
| MOD-04 (Planner) | `IPlannerModule` | Inject self-improvement tasks |
| MOD-05 (Observability) | `IObservabilityModule` | Query traces and token spend |
| MOD-06 (Self-Critique) | `ICritiqueModule` | Audit reflection conclusions |
| MOD-07 (HITL Gateway) | `IHitlGateway` | Send morning brief, alerts |

### Repository Layout

```
src/
├── core/           # Types, config (Zod), errors
├── checklist/      # HEARTBEAT.md parser + writer (pure functions)
├── checker/        # Deterministic "cheap" phase
├── reflection/     # LLM-powered "expensive" phase
├── reporter/       # Morning brief + action dispatch
├── modules/        # Interface contracts for MOD-03/04/05/06/07
├── orchestrator/   # PulseOrchestrator — wires lifecycle
└── index.ts        # Public API barrel export
tests/
├── unit/           # Per-feature, no I/O
├── integration/    # Full lifecycle with stubs
└── fixtures/       # Shared test data builders
docs/
├── adr/            # Architecture Decision Records
└── implementation-plan.md
```

### Key Patterns

- **Dependency Injection** — all modules injected via constructor, never imported directly
- **Result types** for expected failures (`{ ok: true; value: T } | { ok: false; error: E }`)
- **Discriminated unions** for domain types (PulseResult, Action)
- **Branded types** for domain identifiers where needed
- **Zod schemas** for runtime validation at system boundaries (config, LLM responses)
- **Pure functions** for checklist parsing/writing (no I/O in parser module)

### ADRs

| ADR | Title |
|-----|-------|
| ADR-001 | TypeScript 5.x with Strict Mode |
| ADR-002 | Cheap-then-Expensive Escalation |
| ADR-003 | Vitest as Testing Framework |
| ADR-004 | HEARTBEAT.md as Structured Data Source |
| ADR-005 | Provider-Agnostic LLM Interface |
| ADR-006 | Module Interface Contracts (Stubs) |

### Commands

```bash
npm run build         # Compile TypeScript to dist/
npm run typecheck     # Type-check without emitting
npm test              # Run unit tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run test:integration  # Run integration tests (INTEGRATION=true)
npm run lint          # Lint source and test files
```

### Tech Stack

- **Runtime:** Node.js (ES2022, ESM)
- **Language:** TypeScript 5.x (strict mode, all safety flags)
- **Testing:** Vitest + @vitest/coverage-v8 (80% thresholds)
- **Validation:** Zod
- **Build:** tsc (direct compilation)
- **Module:** NodeNext resolution
