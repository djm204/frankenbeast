# @frankenbeast/web

Web dashboard for Frankenbeast — provides a browser-based operator console with chat, tracked-agent launch/detail flows, and network management.

## Launch Role

The dashboard is the primary Beast operator UI. CLI users can perform the same core operations through `frankenbeast beasts`.

## Quick Start

```bash
npm run dev          # Start Vite dev server (default: http://localhost:5173)
npm run dev:chat     # Start with API proxy pointing to chat-server on :3737
npm run build        # Production build (tsc + vite build)
npm run preview      # Preview production build locally
npm test             # Run tests
```

## Run with MCP Mode

Use this when `@fbeast/mcp-suite` has been initialized for a project and you want the dashboard to show the same observer, governor, cost, and Beast data written by MCP tools and hooks. Both surfaces share `.fbeast/beast.db` when the backend points at the same project root.

From the repo root, start the backend against the project where MCP was initialized:

```bash
npm --workspace franken-orchestrator run chat-server -- --base-dir /path/to/your-project
```

If MCP was initialized in this repo, omit `--base-dir`.

From a second terminal, start the dashboard:

```bash
npm --workspace @frankenbeast/web run dev:chat
```

The frontend automatically resolves the API URL at runtime:

- If `VITE_API_URL` is set, requests target that absolute URL.
- Otherwise requests use same-origin `/v1/*` and `/api/*` paths, which works when the dashboard is served by the orchestrator or through the local Vite proxy.
- Production deployments should use TLS-terminated `https://` and `wss://` endpoints. Plain HTTP is only appropriate for isolated local development.

Open the Vite URL, usually `http://127.0.0.1:5173/`. The `dev:chat` script proxies `/api` and `/v1` requests to the local plain-HTTP chat server on `http://127.0.0.1:3737`; production deployments should use TLS-terminated `https://`/`wss://` endpoints.

If you use a non-default backend port:

```bash
npm --workspace franken-orchestrator run chat-server -- --base-dir /path/to/your-project --port 4242
VITE_API_URL=http://127.0.0.1:4242 npm --workspace @frankenbeast/web run dev
```

For Beast controls, keep the operator token on the orchestrator/server side. Do not set a Vite-prefixed browser token; `franken-web` refuses to start when `VITE_BEAST_OPERATOR_TOKEN` is present because Vite bundles `VITE_*` values into client code.

## Beast Control Surface

The `Beasts` tab is now tracked-agent based:

- launches create tracked agents via `POST /v1/beasts/agents`
- `design-doc -> chunk creation` uses a file-style path field
- `martin-loop` uses a directory-style path field
- agent detail shows init lifecycle status, startup events, linked run id, and linked run logs once dispatch occurs

Execution controls (`start`, `stop`, `restart`, `kill`) still target Beast runs after a tracked agent has dispatched.

## Environment Variables

Preferred: set server-side local values in the repo root `.env` so `frankenbeast chat-server` and other Node processes resolve the operator token without exposing it to the browser bundle.

Root `.env` example:

```env
FRANKENBEAST_BEAST_OPERATOR_TOKEN=<your-operator-token>
```

For web-only overrides, you can still create a `.env.local` file in this package directory (never committed), but it must not contain operator credentials:

```env
# Required — Base URL of the franken-orchestrator HTTP server.
# Defaults to window.location.origin if omitted (works when served by the orchestrator).
VITE_API_URL=http://localhost:3737

# Optional — Project identifier for scoping chat sessions. Defaults to "default".
VITE_PROJECT_ID=my-project
```

### Operator token handling

`VITE_BEAST_OPERATOR_TOKEN` is intentionally unsupported. Vite embeds `VITE_*` variables in the browser bundle, so putting the long-lived operator token there exposes the Beast control credential to every dashboard user and any static artifact reader.

**How it works:**

1. The web app makes same-origin requests without a bundled long-lived operator token.
2. The orchestrator keeps the operator token server-side, resolving it from the configured secret backend or server env.
3. The orchestrator's `requireBeastOperatorAuth` middleware continues to validate protected Beast control requests.
4. If `VITE_BEAST_OPERATOR_TOKEN` is set, Vite startup/build fails before the secret can be bundled.

**Server side:** For local development, the orchestrator prefers its configured secret store and may use `FRANKENBEAST_BEAST_OPERATOR_TOKEN` from server-side env or the repo root `.env` as a local fallback. Do not copy that value into `packages/franken-web/.env.local` with a `VITE_` prefix.

**Accepted headers** (server checks in order):
- `Authorization: Bearer <token>`
- `x-frankenbeast-operator-token: <token>`

**Security notes:**
- Never commit `.env.local` or any file containing the token
- Use a strong, random value (e.g., `openssl rand -hex 32`)
- Vite startup/build fails if `VITE_BEAST_OPERATOR_TOKEN` is set, because Vite would embed that token in the browser output

## Getting the operator token

`frankenbeast init` generates the operator token and stores it in the configured secret backend (OS keychain, 1Password, Bitwarden, or local-encrypted file). The token is printed once during `init`.

**Steps:**

1. Run `frankenbeast init` from the project root (first-time setup).
2. Copy the printed token value.
3. Set it in the repo root `.env` only for server-side local development:
   ```env
   FRANKENBEAST_BEAST_OPERATOR_TOKEN=<paste-token-here>
   ```
4. Ensure the orchestrator (`frankenbeast chat-server` or `frankenbeast network`) resolves the token — it reads it from the secret store configured via `network.secureBackend` in your config file.

There is no dedicated `frankenbeast init --regenerate-token` flag in the current CLI. If you lose the token, rerun the supported init/repair flow for your configured secret backend or generate a new strong local development token (for example with `openssl rand -hex 32`) and update the orchestrator-side secret/backend or `FRANKENBEAST_BEAST_OPERATOR_TOKEN` value.

> **Rotation note:** `resolveBeastOperatorToken()` resolves `config.network.operatorTokenRef` from the configured secret store *first*, before any env var or `.env` file. If you already ran `frankenbeast init` with an available secret backend, setting a new `FRANKENBEAST_BEAST_OPERATOR_TOKEN` alone will not take effect — the orchestrator keeps accepting the stored token. To rotate, update (or delete) the secret-store entry for `operatorTokenRef`, or remove `network.operatorTokenRef` from the config, before relying on env/`.env` overrides.
