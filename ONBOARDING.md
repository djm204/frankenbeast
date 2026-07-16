---
title: Frankenbeast Onboarding Checklist
description: Step-by-step local setup checklist for contributors installing, bootstrapping, running the UI, and configuring optional services and secret backends.
---

# Frankenbeast Onboarding Checklist

Use this checklist for a first local checkout or when rebuilding a development environment from scratch.

## Prerequisites

- [ ] Install Node.js `>=22.13.0 <23 || >=24.0.0 <26`.
  - The pinned local default is recorded in `.nvmrc`.
  - `engine-strict=true` means unsupported Node versions fail during npm operations.
- [ ] Verify npm is available. If you need to install Corepack before cloning, activate the literal npm version pinned by this repository:

  ```bash
  node --version
  npm --version
  if ! command -v corepack >/dev/null 2>&1; then npm install -g corepack; fi
  corepack enable npm
  corepack prepare npm@11.5.1 --activate
  ```

- [ ] Install Docker if you plan to run optional local infrastructure with `docker compose`.
  - The compose stack is only needed for ChromaDB, Grafana, and Tempo.
  - Unit and integration tests do not require the full compose stack.
- [ ] Install and log in to at least one supported CLI provider if you plan to run the CLI, chat server, or dashboard chat locally.
  - The default chat path resolves CLI providers such as `claude`, `codex`, or `gemini` from the local machine.
  - API keys such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY` are for API-backed provider configurations and should be exported into the runtime environment when that path is intentionally configured.
- [ ] Choose where secrets should live before running `frankenbeast init`.
  - Default: local encrypted file at `.fbeast/secrets.enc`.
  - Alternatives: OS keychain, 1Password, or Bitwarden via `network.secureBackend` in `.fbeast/config.json`.

## Bootstrap

- [ ] Clone and enter the repository:

  ```bash
  git clone https://github.com/djm204/frankenbeast.git
  cd frankenbeast
  ```

- [ ] Run the one-click bootstrap. It validates Node.js and Corepack, activates the repository-pinned npm version, creates `.env` from `.env.example` when needed, validates required env vars, runs `npm ci`, and skips optional Docker services unless you ask for them:

  ```bash
  npm run bootstrap -- --no-docker
  ```

  To preview checks without mutating files or installing dependencies, run:

  ```bash
  ./scripts/bootstrap.sh --dry-run
  ```

- [ ] New issue workers: before coding, run the environment preflight from the repository root or issue worktree:

  ```bash
  npm --silent run new-worker:preflight -- --json
  ```

  The command prints stable `[new-worker-preflight:<check>] ok|warn|fail - ...` badges by default, or a JSON object with `ok` and `checks` when `--json` is supplied. Use `npm --silent` or `node scripts/new-worker-preflight.mjs --json` for machine-parsed JSON so npm lifecycle banners do not prefix stdout. It verifies the supported Node.js/npm pin, required `git`/`gh`/`jq` commands, GitHub CLI authentication for `github.com`, the project git identity (`David Mendez <me@davidmendez.dev>`), Frankenbeast repository root, and whether the current worktree already has uncommitted files. Use `--skip-github-auth` only for offline docs/tests; run without it before opening PRs.

- [ ] PMs or workers that need profile-specific evidence: run the capability self-test with the expected profile schema or explicit flags before dispatching PR-producing work:

  ```bash
  npm --silent run profile:capability-self-test -- --json --repo djm204/frankenbeast --require-repo-write --toolset terminal,file --delivery-target discord:1523806555047333968
  ```

  The command is read-only: even a failing self-test checks GitHub repository permission with `gh repo view --json viewerPermission` and never creates, edits, pushes, comments, or merges. It verifies expected model/provider labels, required toolsets, `gh` auth, git identity, optional repo write permission, approval-cop availability, and delivery target wiring. Human output uses stable `[profile-capability-self-test:<check>] ok|warn|fail - ...` badges; `--json` returns `{ ok, profile, checks }` for Kanban/Discord reports.

- [ ] Generate a guided checklist when you need a smaller first-run path than the full document. Pick the persona that matches the work:

  ```bash
  npm run first-run:checklist -- --persona operator
  npm --silent run first-run:checklist -- --persona coding-agent --json
  ```

  The generator prints deterministic Markdown by default, or JSON with `persona`, `root`, `items`, `docs`, and `nextAction` for PM/liveness tooling. It never mutates files or runs setup commands; it points each checklist item at the command and docs to run next. Valid personas are `operator`, `coding-agent`, and `contributor`; unknown personas fail closed with an explicit error instead of falling back to a misleading generic checklist.

- [ ] Rehearse the full local-to-PR path before publishing anything:

  ```bash
  npm run local-to-pr:dry-run -- --issue 1700 --title "feat(onboarding): add guided local-to-PR dry run mode"
  npm --silent run local-to-pr:dry-run -- --issue 1700 --title "feat(onboarding): add guided local-to-PR dry run mode" --json
  ```

  The dry run checks auth, install, and git-state prerequisites, then walks through checkout, branch/worktree creation, a no-op change, test selection, PR body generation, Codex review, and cleanup. Every remote mutation is skipped: `git push`, `gh pr create`, `gh pr comment`, and merge actions are printed as planned side effects rather than executed. Local write steps are simulated, and failures include remediation such as `gh auth login`, Corepack/npm activation, `npm ci`, or starting from a clean isolated worktree.

- [ ] Take the interactive workspace tour when you need a deterministic package map before choosing files:

  ```bash
  npm run workspace:tour
  npm --silent run workspace:tour -- --json
  ```

  The tour prints package responsibilities, common ticket routing hints, key docs, generated-file locations, focused test commands, runtime state paths, and safe first commands. JSON mode exposes the same data for agent prompts and PM handoffs, while the docs-drift section reports missing expected package, doc, script, or test paths.

### Progress badges and status output

The bootstrap script prints deterministic status badges as it advances through onboarding:

```text
[onboarding:1/6:prerequisites] start - checking Node.js, npm, and Corepack
[onboarding:1/6:prerequisites] ok - Node.js v22.13.0 satisfies the repository engine range
[onboarding:6/6:done] complete - onboarding bootstrap reached 6/6 steps
```

Read each badge as `[onboarding:<current>/<total>:<stage>] <state> - <detail>`. Automation can key on the stable `onboarding` prefix, fraction, stage, and state values (`start`, `ok`, `error`, `complete`) while humans can follow the detail text. If option parsing fails before the first stage, the stage is `args`; otherwise `error` badges keep the active stage name so PM/liveness tooling can identify the failed stage without parsing prose.

- [ ] Review `.env` and fill in only the values you need:

  ```bash
  $EDITOR .env
  ```

  Common local values:

  - Semantic memory endpoint: `CHROMA_URL=http://localhost:8000` for the local compose stack.
  - Local Grafana: set `GRAFANA_USER=admin` and replace `GRAFANA_PASSWORD` with a unique non-default value before starting optional services.
  - Dashboard/Beast controls: `FRANKENBEAST_BEAST_OPERATOR_TOKEN`, kept server-side only.
  - Provider API keys and the local-encrypted `FRANKENBEAST_PASSPHRASE` must be present in the process environment for commands that read `process.env` directly. Export them in the shell or launch wrapper that starts `frankenbeast`, `chat-server`, or CI jobs; do not assume writing them to `.env` alone makes every runtime path load them.

- [ ] Optional: start local infrastructure during bootstrap after setting Grafana credentials:

  ```bash
  npm run bootstrap -- --services
  ```

- [ ] Optional: create a standalone project from the quick-start example. The script copies `examples/quick-start`, creates `.env` from `.env.example`, and runs `npm ci` in the new directory:

  ```bash
  npm run create:project -- quick-start ../my-frankenbeast-app
  cd ../my-frankenbeast-app
  npm start
  ```

- [ ] Build the workspace packages:

  ```bash
  npm run build
  ```

- [ ] Run the standard verification gates:

  ```bash
  npm run typecheck
  npm test
  ```

  If you are unsure which narrower command fits your change, follow the [test command decision tree](docs/onboarding/test-command-decision-tree.md) before broadening to package or CI-level gates.

- [ ] Optionally link the local CLIs for iterative development:

  ```bash
  npm run local:link
  fbeast --help
  frankenbeast --help
  ```

## Repository ownership

Read the [repository ownership manifest](docs/onboarding/repository-ownership.md) before assigning repository-wide or cross-package work. It maps current package and documentation surfaces to primary owners, escalation owners, verification commands, and PM/worker handoff notes so agents do not guess ownership from path names alone.

Read the [agent role responsibility map](docs/onboarding/agent-role-responsibility-map.md) when assigning, resuming, reviewing, or recovering agent work. It maps PM shards, issue workers, doctors, reviewers, and docs workers to repository responsibilities, required handoff fields, verification commands, and explicit `mustNotOwn` boundaries.

## Coding-agent PR etiquette

Read the [coding-agent PR etiquette guide](docs/onboarding/coding-agent-pr-etiquette.md) before opening, updating, or merging agent-authored pull requests. It defines one-issue/one-PR scope, required PR body evidence, current-head CI/Codex expectations, negative cases that prevent duplicate work, and handoff fields for blocked PRs.

## Issue complexity rubric

Read the [issue complexity rubric](docs/onboarding/issue-complexity-rubric.md) before assigning, refilling, or taking an issue-worker card. It maps issue labels and acceptance criteria to six complexity/risk levels, allowed toolsets, model lanes, verification depth, and escalation triggers so low-risk fallback agents do not take high-risk implementation work.

## PM-swarm runtime glossary

Read the [PM-swarm runtime glossary](docs/onboarding/pm-swarm-runtime-glossary.md) before interpreting PM-swarm Kanban comments, liveness reports, doctor treatment notes, or issue-worker handoffs. It defines the runtime vocabulary used to decode liveness, refill, Codex, approval-cop, and worker handoff terms without creating duplicate branches, worktrees, or PRs.

## Issue worktree bootstrap

When a PM or issue handoff gives you one GitHub issue to fix, start from a dedicated branch/worktree instead of the main checkout:

```bash
npm run issue:worktree -- --dry-run --issue 1769 --title "feat(onboarding): add issue-to-worktree bootstrap helper"
npm run issue:worktree -- --issue 1769 --title "feat(onboarding): add issue-to-worktree bootstrap helper"
```

The helper prints structured issue, branch, worktree path, duplicate-PR check, and verification commands before it mutates anything. By default it creates `../resolve-wt/issue-<number>` from the selected remote's `main` branch, uses a `resolve/issue-<number>-<slug>` branch, and configures the worktree commit identity as `David Mendez <me@davidmendez.dev>`. Use `--reuse --branch <existing-branch>` only when resuming an already-created issue branch; never use it to combine unrelated issues.

## Architecture reading path

Use this path when you are new to Frankenbeast or when an agent handoff says "read the architecture docs first." It is intentionally ordered from current implementation to deeper historical context.

1. **Current implementation before history** — start with [`docs/RAMP_UP.md`](docs/RAMP_UP.md) for the shortest current package map, Beast Loop summary, CLI/runtime wiring notes, known limitations, and build/test commands.
2. **Repository-level model** — read [`README.md#architecture`](README.md#architecture) for the public Beast Loop diagram and current 10-package workspace framing.
3. **Detailed architecture** — read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), especially the System Overview, package table, Beast Loop, Current Local CLI Path, orchestrator internals, and dashboard/control-plane sections. Use the package inventory tables as authoritative when diagrams still use MOD labels.
4. **Runtime handoff flow** — read [`docs/DATA_FLOW.md`](docs/DATA_FLOW.md) to connect user input, planning, execution, observer/cost records, and closure artifacts.
5. **Port and package boundaries** — read [`docs/CONTRACT_MATRIX.md`](docs/CONTRACT_MATRIX.md) before changing cross-package interfaces or assuming a module owns a capability.
6. **Consolidation rationale** — read [ADR-031](docs/adr/031-architecture-consolidation-provider-agnostic.md) to understand why formerly separate MOD packages were consolidated into the orchestrator or MCP suite.
7. **Topic-specific ADRs/guides** — only after the current path above, branch into relevant ADRs under `docs/adr/` or operational guides under `docs/guides/`.

Edge case: many older diagrams and `docs/plans/` files describe target or historical architecture. Do not start with `docs/plans/` when onboarding, and do not treat a plan diagram as live behavior until you verify it against the current package inventory in `docs/RAMP_UP.md` and `docs/ARCHITECTURE.md`.

## Run UI

### Dashboard chat against the local backend

- [ ] Start the chat/dashboard backend from the repo root:

  ```bash
  npm --workspace @franken/orchestrator run chat-server -- --port 3737
  ```

- [ ] In another terminal, start the Vite dashboard with the same-origin proxy target:

  ```bash
  VITE_API_PROXY_TARGET=http://127.0.0.1:3737 npm --workspace @franken/web run dev
  ```

- [ ] Open the Vite URL, usually `http://127.0.0.1:5173/`.

### Dashboard with MCP-mode project telemetry

- [ ] Install the MCP suite persistently so `fbeast` and generated MCP server commands remain on `PATH`:

  ```bash
  npm install -g @franken/mcp-suite
  ```

- [ ] From the project you want to govern, initialize MCP mode:

  ```bash
  fbeast mcp init --hooks
  ```

- [ ] From this Frankenbeast repo, point the backend at that governed project root:

  ```bash
  npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project --port 3737
  ```

- [ ] Start the UI in a second terminal:

  ```bash
  VITE_API_PROXY_TARGET=http://127.0.0.1:3737 npm --workspace @franken/web run dev
  ```

### Beast controls in the dashboard

- [ ] Run init against the same project root the backend will use before enabling Beast controls. If you have not run `npm run local:link`, use the built CLI entrypoint from this checkout:

  ```bash
  # Same-repo dashboard setup
  node packages/franken-orchestrator/dist/cli/run.js init

  # MCP-mode dashboard for another governed project
  node packages/franken-orchestrator/dist/cli/run.js init --base-dir /path/to/your-project
  ```

- [ ] Keep the operator token server-side.
  - For same-repo dashboard setup, use the configured secret backend, or put `FRANKENBEAST_BEAST_OPERATOR_TOKEN=<token>` in an uncommitted local env file read by the Frankenbeast repo processes.
  - For MCP-mode dashboards that target another governed project with `--base-dir`, also provide `FRANKENBEAST_BEAST_OPERATOR_TOKEN` to the Vite process or Frankenbeast repo root `.env`; the Vite dev proxy resolves its token from the Frankenbeast checkout, not from the external governed project's secret store. If the checkout already has a stored operator token, ensure it matches the governed project's backend token or clear/update it before relying on the env fallback.
  - Do not set `VITE_BEAST_OPERATOR_TOKEN`; `VITE_*` values are exposed to browser bundles.
- [ ] If the backend runs on a different port, keep browser calls same-origin through the Vite proxy with `VITE_API_PROXY_TARGET` and, for Beast routes, `VITE_BEAST_API_PROXY_TARGET` when needed.

## Optional services

Before starting Docker or blocking on optional infrastructure, read the [local service dependency explainer](docs/onboarding/local-service-dependencies.md).
It maps ChromaDB, Grafana, Tempo, provider credentials, and secret backends to the capabilities that actually require them, with health checks and PM/worker handoff fields.

- [ ] Configure `.env` before starting the full compose stack.
  - Keep `CHROMA_URL=http://localhost:8000` unless ChromaDB runs elsewhere.
  - Uncomment `GRAFANA_USER=admin` and set a unique `GRAFANA_PASSWORD`; the old `admin/admin` default is intentionally rejected.
- [ ] Start optional infrastructure:

  ```bash
  docker compose up -d
  ```

- [ ] Confirm the expected local services are healthy:
  - ChromaDB: `http://localhost:8000`
  - Grafana: `http://localhost:3000`
  - Tempo readiness: `http://localhost:3200/ready`
  - Tempo OTLP/HTTP: `http://localhost:4318`
- [ ] Seed and verify ChromaDB only when you are using semantic memory locally:

  ```bash
  npm run local:seed
  npm run local:verify-setup
  ```

## Secrets backend

- [ ] Pick the backend before the first `frankenbeast init` run whenever possible.

  ```json
  { "network": { "secureBackend": "local-encrypted" } }
  ```

  Supported values are `local-encrypted`, `os-keychain`, `1password`, and `bitwarden`.

- [ ] For the default `local-encrypted` backend:
  - Run the init command from the Beast controls section interactively to create the encrypted vault.
  - In CI or other headless runtime paths, export only the passphrase variable before commands that must resolve stored secrets:

    ```bash
    export FRANKENBEAST_PASSPHRASE=<passphrase>
    node packages/franken-orchestrator/dist/cli/run.js run --config .fbeast/config.json
    ```

- [ ] For `os-keychain`, set the backend in `.fbeast/config.json`, then run `frankenbeast init`; no passphrase prompt is required.
- [ ] For `1password`:
  - Create or use a vault literally named `frankenbeast`.
  - Authenticate the `op` CLI before init.
  - Init-created items use titles like `frankenbeast/network.operatorTokenRef`.
- [ ] For `bitwarden`:
  - Run `bw login` / `bw unlock`.
  - Export `BW_SESSION` before init.
  - Init-created secure notes use the `frankenbeast/` title prefix.
- [ ] After changing `network.secureBackend`, re-store or migrate any existing secret refs. Changing config alone does not move already stored secret values between backends.

## Troubleshooting

If a PM, liveness monitor, or operator reports a stalled worker, use the dedicated [troubleshooting guide for stalled workers](docs/guides/troubleshooting-stalled-workers.md) before respawning or deleting worktrees. It walks through live task/PR evidence, active versus blocked versus stale classifications, safe recovery actions, and the handoff fields future workers need.

- [ ] `npm install` fails with an engine error:
  - Check `node --version` against the root `engines.node` range.
  - Re-run the Corepack commands in the prerequisites section and `npm run check:package-manager`.
- [ ] `npm run check:package-manager` fails:
  - Run `corepack enable npm`.
  - Run `corepack prepare "$(node -p "require('./package.json').packageManager")" --activate`.
  - Confirm plain `npm --version` matches the root `packageManager` pin.
- [ ] Dashboard requests return 401:
  - Ensure backend and Vite dev server resolve the same server-side operator token.
  - Keep requests same-origin through `VITE_API_PROXY_TARGET` / `VITE_BEAST_API_PROXY_TARGET`.
  - Do not put long-lived tokens in `VITE_*` variables.
- [ ] `chat-server` unexpectedly requires an operator token on loopback:
  - Unset `FRANKENBEAST_NETWORK_MANAGED` for standalone local debugging.
  - If you intentionally run managed network mode, provide `FRANKENBEAST_BEAST_OPERATOR_TOKEN` or the configured secret-store token reference.
- [ ] Beast services operate on the wrong project root:
  - Prefer `--base-dir /absolute/path/to/project` for `frankenbeast chat-server`, `frankenbeast network`, and `frankenbeast beasts-daemon`.
  - Use `FBEAST_ROOT` only for callers that construct Beast services or dispatch built-in Beast runs without an explicit root.
- [ ] Docker services fail to start:
  - Check that Docker is running.
  - Confirm `GRAFANA_PASSWORD` is set to a unique non-default value before starting the full compose stack.
  - Use `docker compose ps` and service logs to inspect failures.
- [ ] Chroma seed or verify scripts cannot connect:
  - Confirm the compose stack is running.
  - Confirm `CHROMA_URL` points to the active ChromaDB endpoint.
- [ ] `frankenbeast init --non-interactive` does not create a fresh setup:
  - This mode only verifies an already-complete config/init state and selected ref fields.
  - Run interactive `frankenbeast init` or `frankenbeast init --repair` to create or repair local state.

## Further reading

- [Quickstart](docs/guides/quickstart.md)
- [Run the Dashboard Chat](docs/guides/run-dashboard-chat.md)
- [Run the CLI Beast Harness](docs/guides/run-cli-beast.md)
- [Deploy Beasts](docs/guides/deploy-beasts.md)
- [Secret Store Architecture](docs/adr/018-secret-store-architecture.md)
