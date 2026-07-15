# Quickstart

Get Frankenbeast running locally.

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26` (see `.nvmrc` for the pinned local default; npm enforces this with `engine-strict=true`)
- Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`; install Corepack first on Node.js 25)
- Docker only if you want the optional ChromaDB/Grafana/Tempo stack

## 1. Install dependencies

```bash
npm run bootstrap -- --no-docker
```

For CI-style validation without mutating files or installing dependencies, run:

```bash
./scripts/bootstrap.sh --dry-run
```

If Corepack is not available yet, install it first with `npm install -g corepack`; the bootstrap script then activates and verifies the root `packageManager` pin.

Dependency locking is centralized at the workspace root: commit updates to the root `package-lock.json` only. Package workspaces under `packages/*` must not carry their own nested `package-lock.json` files; run installs from the repository root so npm records workspace dependency changes in the root lockfile. Standalone example projects under `examples/` may keep their own lockfiles because they are scaffolded outside the monorepo workspace.

Run reproducible dependency audits through the guarded script so the live npm
binary still matches the root `packageManager` pin before `npm audit` runs:

```bash
npm run audit:security
npm run deps:vulnerability-sla
```

`deps:vulnerability-sla` turns the current `npm audit` data into a compact
human-readable dashboard. For automation, run the underlying script with
`--format json`; both modes include severity, package, ecosystem, vulnerable
range/fixed version, age, transitive path, and any supplied issue/PR links. CI
fails only when critical/high findings exceed the default SLA window, while the
daily deterministic security scan publishes both Markdown and JSON report
artifacts without failing the scheduled issue reconciliation.

Dependency-update automation is fail-closed for first-party packages: Dependabot
may update external npm and GitHub Actions dependencies, but it must ignore the
internal `@franken/*` workspace scope for all update types and exclude it from
every npm update group. Run `npm run check:dependabot-supply-chain` after
editing `.github/dependabot.yml` to verify that registry-driven update PRs
cannot confuse internal workspace packages with public packages.

## 2. Configure environment

```bash
# Bootstrap creates .env when it is missing; edit the existing file without overwriting it.
${EDITOR:-vi} .env
# Add provider API keys or local runtime settings as needed:
#   ANTHROPIC_API_KEY for Claude, OPENAI_API_KEY for OpenAI,
#   or GOOGLE_API_KEY / GEMINI_API_KEY for Gemini.
# Before starting the full Docker stack, uncomment GRAFANA_USER=admin and set a
# unique GRAFANA_PASSWORD; Grafana refuses the old admin/admin default pair.
```

## 3. Optional: start infrastructure

```bash
# The bootstrap script validates Grafana credentials before starting compose.
npm run bootstrap -- --with-docker
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

Root scripts currently include `build`, `typecheck`, `test`, `test:ci`, `test:integration`, `test:eval`, `test:e2e`, `test:live:bench`, `test:root`, `test:root:watch`, and `test:coverage`. Older `build:all` / `test:all` commands are not root scripts. Use `test:ci` for the same root-plus-package test target that CI runs locally; it first builds the shared `@franken/types` workspace so fresh checkouts can resolve workspace package exports, and it intentionally excludes Docker smoke, security, dependency, lint, live benchmark, and the broader orchestrator E2E gate that remains a separate CI step. CI runs a deterministic orchestrator E2E smoke subset through the dedicated `ci:test:e2e` retry-wrapped step so the decision is visible outside the aggregate `test:ci` command. `test:integration` runs deterministic workspace integration suites through Turborepo, while `test:eval` and `test:live:bench` are explicit opt-ins outside default `npm test`; `test:live:bench` delegates to the gated `@franken/live-bench` `test:live` task, which sets `FBEAST_LIVE_BENCH_E2E=1`.

## 5. Try the orchestrator CLI

The repository root is private and does not publish a root `frankenbeast` binary
for `npx` to resolve. Link the local workspace CLIs first; the `local:link`
script builds the packages and links both `@franken/orchestrator` and
`@franken/mcp-suite` so `frankenbeast`, `franken`, `frkn`, and `fbeast` are on
your PATH.

```bash
# Build and link the local workspace binaries once from the repo root
npm run local:link

# Show supported commands and flags
frankenbeast --help

# Interview only — generates a design doc under .fbeast/plans/
frankenbeast interview

# Plan from an existing design doc
frankenbeast plan --design-doc docs/my-feature-design.md

# Execute chunks from .fbeast/plans/ or a supplied plan directory
frankenbeast run --plan-dir .fbeast/plans/my-plan/

# Preview GitHub issue triage without executing fixes
frankenbeast issues --repo owner/repo --dry-run
```

`--dry-run` is an issue-workflow flag; it is not a global CLI dry-run flag.

## 6. Optional: initialize MCP mode for a project

The `fbeast` binary ships from the `@franken/mcp-suite` package (there is no package named `fbeast`). Install it persistently so both `fbeast` and the `fbeast-*` MCP server binaries stay on PATH — `mcp init` registers servers as bare `fbeast-memory`/`fbeast-proxy` commands the AI client spawns later, so a one-shot `npx` would leave those servers unable to start:

```bash
# Install once (global), or link both local CLIs from the monorepo with: npm run local:link
npm install -g @franken/mcp-suite

# Standard MCP registration
fbeast mcp init

# Lower-context proxy registration
fbeast mcp init --mode=proxy

# Add generated pre/post-tool hooks
fbeast mcp init --hooks
```

The `fbeast` CLI in this repo exposes MCP operations (`init`, `uninstall`, `beast`) under the `mcp` subcommand; any other command is forwarded to `frankenbeast`. MCP data is stored in `.fbeast/beast.db`.

Runtime skill tools are gated conservatively. Installed `tools.json` entries default to `requiresHitl: true` unless the manifest explicitly marks a reviewed safe tool with `requiresHitl: false`, and MCP skills without a `tools.json` manifest expose their server alias as human-approval-required because the concrete runtime tools are unknown. Review new tool manifests before opting any tool out of HITL.

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

# Deterministic workspace integration suites exposed from the repo root
npm run test:integration

# Explicit opt-in eval/LLM-judge suites exposed from the repo root
npm run test:eval

# Single package via Turbo filter
npx turbo run test --filter=franken-brain

# Explicit opt-in live benchmark suite (sets FBEAST_LIVE_BENCH_E2E=1)
npm run test:live:bench
```
