# Quickstart

Get Frankenbeast running locally.

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26` (see `.nvmrc` for the pinned local default; npm enforces this with `engine-strict=true`)
- Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`; install Corepack first on Node.js 25)
- Docker only if you want the optional ChromaDB/Grafana/Tempo stack

## 1. Install dependencies

```bash
if ! command -v corepack >/dev/null 2>&1; then npm install -g corepack; fi
corepack enable npm
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
npm run check:package-manager
npm install
```

Run reproducible dependency audits through the guarded script so the live npm
binary still matches the root `packageManager` pin before `npm audit` runs:

```bash
npm run audit:security
```

## 2. Configure environment

```bash
cp .env.example .env
# Edit .env with provider API keys or local runtime settings as needed:
#   ANTHROPIC_API_KEY for Claude, OPENAI_API_KEY for OpenAI,
#   or GOOGLE_API_KEY / GEMINI_API_KEY for Gemini.
# Before starting the full Docker stack, uncomment GRAFANA_USER=admin and set a
# unique GRAFANA_PASSWORD; Grafana refuses the old admin/admin default pair.
```

## 3. Optional: start infrastructure

```bash
docker compose up -d
```

This starts the services defined in `docker-compose.yml`:

- **ChromaDB** (port 8000)
- **Grafana** (port 3000)
- **Tempo** (ports 3200, 4317, 4318)

The compose stack pins image versions and mounts `tempo.yaml` into Tempo so the
optional tracing backend does not depend on floating tags or an implicit config.

There is no `firewall` Docker service in the current compose file.

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
npx frankenbeast run --plan-dir .fbeast/plans/my-plan/

# Preview GitHub issue triage without executing fixes
npx frankenbeast issues --repo owner/repo --dry-run
```

`--dry-run` is an issue-workflow flag; it is not a global CLI dry-run flag.

## 6. Optional: initialize MCP mode for a project

The `fbeast` binary ships from the `@franken/mcp-suite` package (there is no package named `fbeast`). Install it persistently so both `fbeast` and the `fbeast-*` MCP server binaries stay on PATH — `mcp init` registers servers as bare `fbeast-memory`/`fbeast-proxy` commands the AI client spawns later, so a one-shot `npx` would leave those servers unable to start:

```bash
# Install once (global), or link from the monorepo with: npm link --workspace=packages/franken-mcp-suite
npm install -g @franken/mcp-suite

# Standard MCP registration
fbeast mcp init

# Lower-context proxy registration
fbeast mcp init --mode=proxy

# Add generated pre/post-tool hooks
fbeast mcp init --hooks
```

The `fbeast` CLI in this repo exposes MCP operations (`init`, `uninstall`, `beast`) under the `mcp` subcommand; any other command is forwarded to `frankenbeast`. MCP data is stored in `.fbeast/beast.db`.

## Project structure

```text
frankenbeast/
├── package.json                 # npm workspace root + Turborepo scripts
├── docker-compose.yml           # optional ChromaDB/Grafana/Tempo stack
├── docs/
├── packages/
│   ├── franken-brain/           # @franken/brain: SQLite-backed working/episodic/recovery memory
│   ├── franken-planner/         # @franken/planner: DAG planning primitives and strategies
│   ├── franken-observer/        # trace/cost/eval/loop observability
│   ├── franken-critique/        # critique pipeline and correction requests
│   ├── franken-governor/        # HITL triggers, approvals, audit/security helpers
│   ├── franken-types/           # shared types and Zod schemas
│   ├── franken-orchestrator/    # @franken/orchestrator: Beast Loop, CLI, HTTP surfaces, providers
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
