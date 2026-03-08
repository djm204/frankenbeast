# CLAUDE.md - Development Guide

## Project: franken-planner (MOD-04 — The Executive)

**franken-planner** is the Planning and Decomposition module of the **Frankenbeast** AI agent system. It converts complex user goals into structured, executable plans represented as Directed Acyclic Graphs (DAGs) of tasks.

### Responsibility

- Receive sanitized intent from **MOD-01** (Guardrails)
- Decompose goals into DAG task graphs with objectives, required skills, and dependencies
- Select and execute planning strategies: Linear, Parallel, Recursive
- Enforce Chain-of-Thought (CoT) rationale before every tool call
- Recover from failures via dynamic replanning (inserting fix-it subtasks)
- Pause for Human-in-the-Loop (HITL) approval on "0 to 1" builds
- Surface rationale to **MOD-07** (Self-Critique) for pre-execution verification

### Frankenbeast Module Map

| Module | Role                       | Relationship to MOD-04                                       |
| ------ | -------------------------- | ------------------------------------------------------------ |
| MOD-01 | Guardrails                 | Provides sanitized input; can block actions                  |
| MOD-02 | `@djm204/agent-skills`     | Tool/skill discovery — MOD-04 queries available capabilities |
| MOD-03 | Episodic & Semantic Memory | Provides ADRs, project rules, known errors for context       |
| MOD-04 | **This module — Planning** | Owns the DAG, strategies, CoT, HITL, self-correction         |
| MOD-07 | Self-Critique              | Receives CoT rationale; verifies logic before execution      |

### Tech Stack

| Concern     | Choice                  | Rationale                                |
| ----------- | ----------------------- | ---------------------------------------- |
| Language    | TypeScript 5.x (strict) | Type-safe module boundaries; see ADR-001 |
| Runtime     | Node.js 22 LTS          | Stable, LTS, native ESM                  |
| Testing     | Vitest                  | ESM-native, fast; see ADR-003            |
| Package mgr | pnpm                    | Fast, strict hoisting                    |
| Build       | tsup                    | Zero-config TS bundler                   |
| Linting     | ESLint + Prettier       | Enforced in CI                           |

### Key Architectural Decisions

See `docs/adr/` for full records. Summary:

| ADR     | Decision                                                    |
| ------- | ----------------------------------------------------------- |
| ADR-001 | TypeScript strict mode                                      |
| ADR-002 | DAG as adjacency list (no external graph library)           |
| ADR-003 | Vitest as test framework                                    |
| ADR-004 | Strategy pattern for Linear / Parallel / Recursive planners |
| ADR-005 | Typed interfaces at all module boundaries (DI-friendly)     |
| ADR-006 | HITL via Markdown checklist export + async Promise approval |
| ADR-007 | Immutable DAG with versioned snapshots for replanning       |

### Development Workflow

- **TDD**: Write failing test first, then implement. No feature code without a test.
- **ADRs**: Document every significant architectural decision in `docs/adr/` before coding.
- **Atomic commits**: One logical change per commit. Format: `type(scope): message`.
- **Small PRs**: Each PR maps to one feature phase. PRs ship a working vertical slice.
- **HITL gate**: Planner pauses and exports a Markdown checklist before executing "0 to 1" builds.

### Commit Convention

```
feat(dag): implement topological sort with cycle detection
test(planner): add unit tests for RecursivePlanner
fix(hitl): handle user abort in approval flow
docs(adr): add ADR-005 module interface contracts
chore(ci): add Vitest coverage threshold gate
```

### Project Structure (target)

```
src/
  core/          # DAG engine, task types, graph utilities
  planners/      # LinearPlanner, ParallelPlanner, RecursivePlanner
  cot/           # Chain-of-Thought rationale enforcement
  hitl/          # Human-in-the-Loop wait state and approval flow
  recovery/      # Dynamic replanning and self-correction loop
  modules/       # Typed interfaces for MOD-01, MOD-02, MOD-03, MOD-07
  index.ts       # Public API
tests/
  unit/
  integration/
docs/
  adr/           # Architecture Decision Records
  implementation-plan.md
```

---

This project uses AI-assisted development. Rules in `.cursor/rules/` provide guidance.

## Installed Templates

- **Shared** (always included): Core principles, code quality, security, git workflow, communication
- **javascript-expert**: Principal-level JavaScript & TypeScript engineering (Node.js, React, type system, testing)
- **testing**: Comprehensive testing practices (TDD, test design, CI/CD integration, performance testing)
- **qa-engineering**: Quality assurance programs for confident, rapid software delivery
- **ml-ai**: Machine learning and AI systems (model development, deployment, monitoring)

## Rule Files

All rules are in `.cursor/rules/`. The AI assistant reads these automatically.

#### Shared Rules

| Rule                        | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `core-principles.mdc`       | Honesty, simplicity, testing requirements |
| `code-quality.mdc`          | SOLID, DRY, clean code patterns           |
| `security-fundamentals.mdc` | Zero trust, input validation, secrets     |
| `git-workflow.mdc`          | Commits, branches, PRs, safety            |
| `communication.mdc`         | Direct, objective, professional           |

#### Javascript-expert Rules

| Rule                                         | Purpose                         |
| -------------------------------------------- | ------------------------------- |
| `javascript-expert-language-deep-dive.mdc`   | language deep dive guidelines   |
| `javascript-expert-node-patterns.mdc`        | node patterns guidelines        |
| `javascript-expert-overview.mdc`             | overview guidelines             |
| `javascript-expert-performance.mdc`          | performance guidelines          |
| `javascript-expert-react-patterns.mdc`       | react patterns guidelines       |
| `javascript-expert-testing.mdc`              | testing guidelines              |
| `javascript-expert-tooling.mdc`              | tooling guidelines              |
| `javascript-expert-typescript-deep-dive.mdc` | typescript deep dive guidelines |

#### Testing Rules

| Rule                              | Purpose                        |
| --------------------------------- | ------------------------------ |
| `testing-advanced-techniques.mdc` | advanced techniques guidelines |
| `testing-ci-cd-integration.mdc`   | ci cd integration guidelines   |
| `testing-overview.mdc`            | overview guidelines            |
| `testing-performance-testing.mdc` | performance testing guidelines |
| `testing-quality-metrics.mdc`     | quality metrics guidelines     |
| `testing-reliability.mdc`         | reliability guidelines         |
| `testing-tdd-methodology.mdc`     | tdd methodology guidelines     |
| `testing-test-data.mdc`           | test data guidelines           |
| `testing-test-design.mdc`         | test design guidelines         |
| `testing-test-types.mdc`          | test types guidelines          |

#### Qa-engineering Rules

| Rule                               | Purpose                  |
| ---------------------------------- | ------------------------ |
| `qa-engineering-automation.mdc`    | automation guidelines    |
| `qa-engineering-metrics.mdc`       | metrics guidelines       |
| `qa-engineering-overview.mdc`      | overview guidelines      |
| `qa-engineering-quality-gates.mdc` | quality gates guidelines |
| `qa-engineering-test-design.mdc`   | test design guidelines   |
| `qa-engineering-test-strategy.mdc` | test strategy guidelines |

#### Ml-ai Rules

| Rule                          | Purpose                      |
| ----------------------------- | ---------------------------- |
| `ml-ai-data-engineering.mdc`  | data engineering guidelines  |
| `ml-ai-deployment.mdc`        | deployment guidelines        |
| `ml-ai-model-development.mdc` | model development guidelines |
| `ml-ai-monitoring.mdc`        | monitoring guidelines        |
| `ml-ai-overview.mdc`          | overview guidelines          |
| `ml-ai-security.mdc`          | security guidelines          |
| `ml-ai-testing.mdc`           | testing guidelines           |

## Customization

- Create new `.mdc` files in `.cursor/rules/` for project-specific rules
- Edit existing files directly; changes take effect immediately
- Re-run to update: `npx @djm204/agent-skills javascript-expert testing qa-engineering ml-ai`
