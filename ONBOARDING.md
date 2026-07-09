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
- [ ] Verify npm is available, then use Corepack to activate the repository-pinned npm version:

  ```bash
  node --version
  npm --version
  if ! command -v corepack >/dev/null 2>&1; then npm install -g corepack; fi
  corepack enable npm
  corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
  npm run check:package-manager
  ```

- [ ] Install Docker if you plan to run optional local infrastructure with `docker compose`.
  - The compose stack is only needed for ChromaDB, Grafana, and Tempo.
  - Unit and integration tests do not require the full compose stack.
- [ ] Install or configure at least one provider path if you plan to run the CLI, chat server, or dashboard chat.
  - API-backed providers read `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`.
  - CLI-backed paths depend on the corresponding local CLI being installed and logged in.
- [ ] Choose where secrets should live before running `frankenbeast init`.
  - Default: local encrypted file at `.fbeast/secrets.enc`.
  - Alternatives: OS keychain, 1Password, or Bitwarden via `network.secureBackend` in `.fbeast/config.json`.

## Bootstrap

- [ ] Clone and enter the repository:

  ```bash
  git clone https://github.com/djm204/frankenbeast.git
  cd frankenbeast
  ```

- [ ] Install dependencies with the pinned npm version:

  ```bash
  npm install
  ```

- [ ] Create a local environment file and fill in only the values you need:

  ```bash
  cp .env.example .env
  $EDITOR .env
  ```

  Common local values:

  - Provider keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`.
  - Semantic memory endpoint: `CHROMA_URL=http://localhost:8000` for the local compose stack.
  - Local encrypted secrets in headless runtime paths: `FRANKENBEAST_PASSPHRASE`.
  - Dashboard/Beast controls: `FRANKENBEAST_BEAST_OPERATOR_TOKEN`, kept server-side only.

- [ ] Build the workspace packages:

  ```bash
  npm run build
  ```

- [ ] Run the standard verification gates:

  ```bash
  npm run typecheck
  npm test
  ```

- [ ] Optionally link the local CLIs for iterative development:

  ```bash
  npm run local:link
  fbeast --help
  frankenbeast --help
  ```

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

- [ ] Run `frankenbeast init` before enabling Beast controls so the backend has module settings, a secret backend, and `network.operatorTokenRef`:

  ```bash
  frankenbeast init
  ```

- [ ] Keep the operator token server-side.
  - Use the configured secret backend, or put `FRANKENBEAST_BEAST_OPERATOR_TOKEN=<token>` in an uncommitted local env file.
  - Do not set `VITE_BEAST_OPERATOR_TOKEN`; `VITE_*` values are exposed to browser bundles.
- [ ] If the backend runs on a different port, keep browser calls same-origin through the Vite proxy with `VITE_API_PROXY_TARGET` and, for Beast routes, `VITE_BEAST_API_PROXY_TARGET` when needed.

## Optional services

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
  npx tsx scripts/seed.ts
  npx tsx scripts/verify-setup.ts
  ```

## Secrets backend

- [ ] Pick the backend before the first `frankenbeast init` run whenever possible.

  ```json
  { "network": { "secureBackend": "local-encrypted" } }
  ```

  Supported values are `local-encrypted`, `os-keychain`, `1password`, and `bitwarden`.

- [ ] For the default `local-encrypted` backend:
  - Run `frankenbeast init` interactively to create the encrypted vault.
  - In CI or other headless runtime paths, export only the passphrase variable before commands that must resolve stored secrets:

    ```bash
    export FRANKENBEAST_PASSPHRASE=<passphrase>
    frankenbeast run --config .fbeast/config.json
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
