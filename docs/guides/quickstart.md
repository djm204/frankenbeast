# Quickstart

Get Frankenbeast running locally.

## Prerequisites

- Node.js >= 20 for root workspace tasks; Node.js >= 22 for orchestrator/dashboard runtime workflows
- npm >= 10 (the repo is an npm workspaces monorepo; root `packageManager` is npm)
- Docker only if you want the optional ChromaDB/Grafana/Tempo stack

## 1. Install dependencies

```bash
npm install
```

## 2. Optional: start infrastructure

```bash
docker compose up -d
```

This starts the services defined in `docker-compose.yml`:

- **ChromaDB** (port 8000)
- **Grafana** (port 3000)
- **Tempo** (ports 3200, 4317, 4318)

There is no `firewall` Docker service in the current compose file.

## 3. Configure environment

```bash
cp .env.example .env
# Edit .env with provider API keys or local runtime settings as needed
```

## 4. Build and verify

```bash
npm run build
npm run typecheck
npm test
```

Root scripts currently include `build`, `typecheck`, `test`, `test:root`, `test:root:watch`, and `test:coverage`. Older `build:all` / `test:all` commands are not root scripts.

## 5. Try the orchestrator CLI

```bash
# Show supported commands and flags
npx frankenbeast --help

# Interview only — generates a design doc under .fbeast/plans/
npx frankenbeast interview

# Plan from an existing design doc
npx frankenbeast plan --design-doc docs/my-feature-design.md

# Execute chunks from .fbeast/plans/ or a supplied plan directory
npx frankenbeast run --plan-dir .fbeast/plans/my-plan/chunks

# Preview GitHub issue triage without executing fixes
npx frankenbeast issues --repo owner/repo --dry-run
```

`--dry-run` is an issue-workflow flag; it is not a global CLI dry-run flag.

## 6. Optional: initialize MCP mode for a project

```bash
# Standard MCP registration
npx fbeast init

# Lower-context proxy registration
npx fbeast init --mode=proxy

# Add generated pre/post-tool hooks
npx fbeast init --hooks
```

The `fbeast` CLI in this repo exposes `init`, `uninstall`, and `beast` directly. MCP data is stored in `.fbeast/beast.db`.

## Project structure

```text
frankenbeast/
├── package.json                 # npm workspace root + Turborepo scripts
├── docker-compose.yml           # optional ChromaDB/Grafana/Tempo stack
├── docs/
├── packages/
│   ├── franken-brain/           # SQLite-backed working/episodic/recovery memory
│   ├── franken-planner/         # DAG planning primitives and strategies
│   ├── franken-observer/        # trace/cost/eval/loop observability
│   ├── franken-critique/        # critique pipeline and correction requests
│   ├── franken-governor/        # HITL triggers, approvals, audit/security helpers
│   ├── franken-types/           # shared types and Zod schemas
│   ├── franken-orchestrator/    # Beast Loop, CLI, HTTP surfaces, providers
│   ├── franken-mcp-suite/       # fbeast CLI, MCP servers, hooks, proxy
│   ├── franken-web/             # React dashboard
│   └── live-bench/              # live benchmark tooling
└── tests/                       # root-level integration tests
```

## Running tests

```bash
# All package tests through Turborepo
npm test

# Root-level Vitest tests only
npm run test:root

# Single package via Turbo filter
npx turbo run test --filter=franken-brain
```
