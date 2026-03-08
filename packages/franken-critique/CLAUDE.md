# CLAUDE.md - Development Guide

## Project: franken-critique (MOD-06: Self-Critique & Reflection)

Part of the **Frankenbeast** agentic orchestrator system. MOD-06 implements the "Reflexion" pattern — a secondary, specialized agentic process that evaluates the output of the "Coder/Actor" agent before it reaches the user or production. Its goal is to identify hallucinations, logic flaws, and architectural drift.

### Module Context

| Module | Repo | Relationship to MOD-06 |
|--------|------|----------------------|
| MOD-01 Guardrails | frankenfirewall | Provides safety rules, sandbox execution |
| MOD-03 Memory | franken-brain | Provides ADRs/episodic traces; receives critique lessons |
| MOD-04 Planner | franken-planner | Sends plans for review |
| MOD-05 Observability | franken-observer | Provides token spend data |
| MOD-07 Governance | franken-governor | Receives HITL escalation requests |

### Architecture (see `docs/adr/`)

- **Evaluator Pipeline** (ADR-002): Composable evaluators behind a shared `Evaluator` interface. Deterministic checks run first; heuristic checks follow. Safety failures short-circuit.
- **Circuit Breakers** (ADR-003): MaxIteration (3-5), TokenBudget, ConsensusFailure. Checked before each loop iteration.
- **Critique Loop** (ADR-006): Orchestrates pipeline + breakers. Returns one of four verdicts: `pass`, `fail` (with correction request), `halted`, or `escalated`.
- **Port Interfaces** (ADR-004): Hexagonal ports for MOD-01, MOD-03, MOD-05, MOD-07. Mockable for independent testing.

### Key Decisions

| Decision | Choice | ADR |
|----------|--------|-----|
| Language | TypeScript strict, NodeNext, tsc | ADR-001 |
| Architecture | Composable evaluator pipeline | ADR-002 |
| Loop safety | Three-breaker circuit breaker pattern | ADR-003 |
| Module integration | Port/adapter interfaces | ADR-004 |
| Error handling | Custom error hierarchy | ADR-005 |
| Loop engine | Stateless CritiqueLoop, 4-variant result | ADR-006 |

---

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.x (strict mode, ESM)
- **Build:** `tsc` (Pattern A — NodeNext)
- **Test:** Vitest 4.x (`tests/unit/`, `tests/integration/`)
- **Lint:** ESLint flat config + typescript-eslint + prettier
- **Package:** `@franken/critique`

## Development Workflow

### TDD (Red-Green-Refactor)

Every feature starts with a failing test. Write minimum code to pass. Refactor while green. Commit after each green.

### Commits

Conventional Commits: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `style`, `ci`
- One logical change per commit. Each commit must compile and pass all tests.
- Separate concerns: tests, implementation, and refactoring in separate commits.

### Branches & PRs

- Branch from `main`: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Small PRs: max ~400 lines changed per PR
- See `docs/implementation-plan.md` for the full phase breakdown and PR plan

### Quality Gates

- 90% line coverage, 80% branch coverage
- Zero `any` types
- All lint rules pass
- `npm run build && npm test && npm run lint` green

## Commands

```bash
npm run build          # tsc
npm test               # vitest run (unit tests)
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
npm run test:integration  # vitest run --config vitest.integration.config.ts
npm run lint           # eslint
npm run lint:fix       # eslint --fix
```

---

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

#### Ml-ai Rules

| Rule | Purpose |
|------|---------|
| `ml-ai-data-engineering.mdc` | data engineering guidelines |
| `ml-ai-deployment.mdc` | deployment guidelines |
| `ml-ai-model-development.mdc` | model development guidelines |
| `ml-ai-monitoring.mdc` | monitoring guidelines |
| `ml-ai-overview.mdc` | overview guidelines |
| `ml-ai-security.mdc` | security guidelines |
| `ml-ai-testing.mdc` | testing guidelines |

## Customization

- Create new `.mdc` files in `.cursor/rules/` for project-specific rules
- Edit existing files directly; changes take effect immediately
- Re-run to update: `npx @djm204/agent-skills javascript-expert web-backend qa-engineering testing ml-ai`
