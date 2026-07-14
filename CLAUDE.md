# CLAUDE.md - Development Guide

This project uses AI-assisted development. Rules in `.cursor/rules/` provide guidance.

## Monorepo Layout

This is an npm workspaces monorepo with Turborepo for build orchestration. The root `package.json` declares `packages/*`, so the live workspace map is the direct `packages/<name>/package.json` set:

```
packages/
├── franken-types/           # @franken/types: Shared types + runtime Zod schemas
├── franken-brain/           # @franken/brain: MOD-03 SQLite-backed memory (working + episodic)
├── franken-planner/         # @franken/planner: MOD-04 DAG planning, strategies, recovery primitives
├── franken-observer/        # @franken/observer: MOD-05 tracing, token/cost tracking, circuit breaker
├── franken-critique/        # @franken/critique: MOD-06 self-critique evaluators + reviewer loop
├── franken-governor/        # @franken/governor: MOD-07 HITL governance, triggers, approval gateway
├── franken-orchestrator/    # @franken/orchestrator: Beast Loop, CLI, chat/network servers
├── franken-mcp-suite/       # @franken/mcp-suite: fbeast CLI, MCP servers, hooks, proxy
├── franken-web/             # @franken/web: React dashboard
└── live-bench/              # @franken/live-bench: Live CLI benchmark tooling
```

The repository currently contains the following 10 active packages:

- `franken-brain` – @franken/brain: MOD-03 SQLite-backed memory (working + episodic)
- `franken-critique` – @franken/critique: MOD-06 self-critique evaluators + reviewer loop
- `franken-governor` – @franken/governor: MOD-07 HITL governance, triggers, approval gateway
- `franken-mcp-suite` – @franken/mcp-suite: fbeast CLI, MCP servers, hooks, proxy
- `franken-observer` – @franken/observer: MOD-05 tracing, token/cost tracking, circuit breaker
- `franken-orchestrator` – @franken/orchestrator: Beast Loop, CLI, chat/network servers
- `franken-planner` – @franken/planner: MOD-04 DAG planning, strategies, recovery primitives
- `franken-types` – @franken/types: Shared types + runtime Zod schemas
- `franken-web` – @franken/web: React dashboard
- `live-bench` – @franken/live-bench: Live CLI benchmark tooling

Historical packages such as `frankenfirewall`, `franken-skills`, `franken-heartbeat`, `franken-mcp`, and `franken-comms` have been consolidated into `@franken/orchestrator` and `@franken/mcp-suite` per [ADR-031](docs/adr/031-architecture-consolidation-provider-agnostic.md); they are not standalone workspaces anymore.

**Build commands** (all via Turborepo):
- `npm run build` — runs `turbo run build` (dependency-ordered)
- `npm test` — runs `turbo run test` (parallel across packages)
- `npm run typecheck` — runs `turbo run typecheck`
- Per-package: `npx turbo run test --filter=franken-brain`

Cross-package dependencies are managed by npm workspaces (e.g., `@franken/types`). See [ADR-011](docs/adr/011-real-monorepo-migration.md) for the migration from individual repos.

## Installed Templates

- **Shared** (always included): Core principles, code quality, security, git workflow, communication
- **javascript-expert**: JavaScript and TypeScript — Node.js, React, type system, performance, and testing
- **qa-engineering**: Quality assurance programs for confident, rapid software delivery
- **testing**: Comprehensive testing practices (TDD, test design, CI/CD integration, performance testing)
- **web-backend**: Backend APIs and services (REST, GraphQL, microservices)
- **ml-ai**: Machine learning and AI systems (model development, deployment, monitoring)

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

## Mandatory: .gitignore Hygiene

When adding new packages, tools, build artifacts, or dependencies you **MUST** verify .gitignore coverage:

1. **Before committing**, run `git status` and check for untracked files that should not be tracked
2. **Never commit** build artifacts (`dist/`, `.turbo/`, `coverage/`), secrets (`.env`, credentials), or tool caches (`node_modules/`, `.build/`)
3. **If a new tool generates output** (e.g., turbo cache, vitest coverage, tsc output), add its output directory to `.gitignore` BEFORE committing anything else
4. **If files are already tracked that shouldn't be**, remove them with `git rm -r --cached <path>` — do NOT just add to .gitignore (gitignore only affects untracked files)
5. **Root `.gitignore`** covers repo-wide patterns; package-level `.gitignore` files cover package-specific patterns

Common patterns that MUST be ignored:
- `node_modules/` — dependencies
- `dist/` — build output (CI builds from source)
- `.turbo/` — turbo cache and logs
- `coverage/` — test coverage reports
- `.build/` — frankenbeast build runner artifacts
- `.env`, `.env.*` — environment secrets
- `*.db`, `*.db-shm`, `*.db-wal` — SQLite files

## Customization

- Create new `.mdc` files in `.cursor/rules/` for project-specific rules
- Edit existing files directly; changes take effect immediately
- The checked-in root assistant rules are maintained from this repository. When workflow guidance changes, update the supported source in [`djm204/agent-workflow-skills`](https://github.com/djm204/agent-workflow-skills), then copy the relevant Claude/Cursor guidance into `.cursor/rules/` with a focused reviewable diff.
- Do not regenerate the root `.cursor/rules/*.mdc` files with the legacy `@djm204/agent-skills` package; package-level `project-outline.md` cleanup is tracked separately from this root assistant-guide maintenance path.
