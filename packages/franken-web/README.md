# @franken/web

Web dashboard for Frankenbeast — provides a browser-based operator console with chat, tracked-agent launch/detail flows, and network management.

## Launch Role

The dashboard is the primary Beast operator UI. CLI users can perform the same core operations through `frankenbeast beasts`.

## Quick Start

```bash
npm run dev          # Start Vite dev server (default: http://localhost:5173)
npm run dev:chat     # Start with API proxy pointing to chat-server on :3737
npm run dev:network  # Start the network-management dashboard dev server
npm run build        # Production build (tsc + vite build)
npm run preview      # Preview production build locally
npm test             # Run tests
npm run typecheck    # Run the web package TypeScript check (tsc --noEmit)
```

Use `npm run dev:network` when working on the Network tab or local network-service flows. It serves the web dashboard in local Vite dev mode; keep API calls behind the same-origin proxy and set `VITE_API_PROXY_TARGET` when `/v1/network/*` should talk to a non-default local orchestrator/daemon. Set `VITE_BEAST_API_PROXY_TARGET` only when Beast controls under `/v1/beasts/*` should use a different target.

From the repo root, run the same focused TypeScript check with:

```bash
npm --workspace @franken/web run typecheck
```

## Run with MCP Mode

Use this when `@franken/mcp-suite` has been initialized for a project and you want the dashboard to show the same observer, governor, cost, and Beast data written by MCP tools and hooks. Both surfaces share `.fbeast/beast.db` when the backend points at the same project root.

From the repo root, start the backend against the project where MCP was initialized:

```bash
npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project
```

If MCP was initialized in this repo, omit `--base-dir`.

From a second terminal, start the dashboard:

```bash
npm --workspace @franken/web run dev:chat
```

The frontend uses same-origin API paths at runtime:

- Browser requests target `/v1/*` and `/api/*` on the dashboard origin.
- During `dev:chat`, `dev`, and `preview`, Vite proxies those paths to the backend and injects the operator token server-side only.
- The browser chat client never accepts or attaches a long-lived operator bearer token; authentication must come from the same-origin server/BFF layer or scoped HttpOnly/SameSite session cookies.
- Production/static deployments must serve the dashboard behind the orchestrator or another server-side BFF/reverse proxy that terminates TLS and forwards same-origin API paths; do not configure browser-readable backend URLs or tokens.

Open the Vite URL, usually `http://127.0.0.1:5173/`. The `dev:chat` script proxies `/api` and `/v1` requests to the local plain-HTTP chat server on `http://127.0.0.1:3737`; production deployments should use TLS-terminated `https://`/`wss://` endpoints.

If you use a non-default backend port in local development, keep `VITE_API_URL` unset and set `VITE_API_PROXY_TARGET` so the Vite `/v1/chat` proxy keeps chat auth server-side. Beast routes (`/v1/beasts/*`) reuse that same target by default. Set `VITE_BEAST_API_PROXY_TARGET` only when Beast controls run on a different backend, for example a separate local orchestrator or daemon port:

| Local workflow | Backend topology | Vite env vars to set |
| --- | --- | --- |
| Chat-only dashboard | `chat-server` serves `/api/*`, `/v1/chat/*`, and the chat WebSocket | Defaults need no extra env; for a custom chat-server port, set only `VITE_API_PROXY_TARGET`. |
| Chat plus Beast controls through one backend | `chat-server` also handles or proxies `/v1/beasts/*` | Set `VITE_API_PROXY_TARGET` to the chat-server URL and leave `VITE_BEAST_API_PROXY_TARGET` unset. |
| Chat plus separate Beast daemon | `chat-server` handles chat/API; `beasts-daemon` handles `/v1/beasts/*` on another URL | Set `VITE_API_PROXY_TARGET` to chat-server and `VITE_BEAST_API_PROXY_TARGET` to beasts-daemon. |

Leave `VITE_API_URL` unset for all local Vite workflows. It is a legacy/reserved browser value and does not select the backend port for the current same-origin dashboard client.

```bash
npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project --port 4242
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 npm --workspace @franken/web run dev

# Separate Beast backend: run these foreground services in separate terminals.
# Terminal 1: start the Beast daemon first with the server-side operator token
# from `frankenbeast init`.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
npm --workspace @franken/orchestrator run beasts-daemon -- --base-dir /path/to/your-project --port 4050

# Terminal 2: start chat-server after the daemon is listening.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
FRANKENBEAST_BEAST_DAEMON_URL=http://127.0.0.1:4050 \
  npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project --port 4242

# Terminal 3: start Vite with the same server-side token for its Beast proxy.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 \
VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4050 \
  npm --workspace @franken/web run dev
```

For Beast controls in Vite dev mode, put the operator token generated by `frankenbeast init` in the repo root `.env` as `FRANKENBEAST_BEAST_OPERATOR_TOKEN=<token>`. The Vite server reads that value only for same-origin proxy requests; the browser bundle must not receive the long-lived operator token.

## Provider outage incidents

The dashboard provider rail renders a `Provider outage incident` alert whenever the `/api/dashboard` snapshot marks one or more configured providers as unavailable. The banner lists unavailable providers in failover order with their provider type and failover position, then directs operators to use the next available failover provider and verify credentials or upstream status before launching new work. When all configured providers are healthy, or when no providers are configured, the incident banner is intentionally hidden.

## Beast Control Surface

The `Beasts` tab is now tracked-agent based:

- launches create tracked agents via `POST /v1/beasts/agents`
- `design-doc -> chunk creation` uses a file-style path field
- `martin-loop` uses a directory-style path field
- agent detail shows init lifecycle status, startup events, linked run id, and linked run logs once dispatch occurs

Path-style fields entered in the dashboard are normalized client-side before submission:

- duplicate separators and `.` segments are collapsed for deterministic display/submission
- NUL bytes and `..` parent-traversal segments are rejected by default
- launch submissions use repo-relative paths; absolute paths, drive-letter paths, and UNC paths are rejected at the wizard boundary
- the only traversal override is the explicit `allowParentTraversal` option in `normalizePath`, reserved for already-trusted operator-supplied paths outside untrusted launch submissions; untrusted UI/API text should keep the default deny-by-default behavior

Execution controls (`start`, `stop`, `restart`, `kill`) still target Beast runs after a tracked agent has dispatched.

## Environment Variables

Preferred: set shared local values in the repo root `.env` so the backend and the Vite dev proxy can read the same server-side token. Do not define a `VITE_*` operator token; Vite exposes `VITE_*` values to browser code.

Root `.env` example:

```env
FRANKENBEAST_BEAST_OPERATOR_TOKEN=<your-operator-token>
```

For web-only development overrides, you can still create a `.env.local` file in this package directory (never committed), but keep credentials server-side:

```env
# Optional — Backend target for the same-origin Vite dev proxy.
VITE_API_PROXY_TARGET=http://127.0.0.1:3737

# Optional — Beast daemon target when it differs from VITE_API_PROXY_TARGET.
VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4050

# Optional — Project identifier for scoping chat sessions. Defaults to "default".
VITE_PROJECT_ID=my-project
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Legacy/reserved API base URL. Leave unset in Vite dev mode; the current web client intentionally ignores this value and always calls same-origin paths so browser requests stay behind the server-side proxy/BFF. Do not use it to select a custom local backend port. |
| `VITE_API_PROXY_TARGET` | Backend target for the same-origin Vite dev proxy. Defaults to `http://127.0.0.1:3737`; set this when the backend runs on another port, for example `VITE_API_PROXY_TARGET=http://127.0.0.1:4242 npm run dev`. |
| `VITE_BEAST_API_PROXY_TARGET` | Beast daemon target for `/v1/beasts/*` in Vite dev mode. Defaults to `VITE_API_PROXY_TARGET`; set it only when Beast controls use a different local backend, for example `VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4050`. |
| `VITE_PROJECT_ID` | Optional project identifier for scoping chat sessions. Defaults to `default`. |

### Operator token handling

`FRANKENBEAST_BEAST_OPERATOR_TOKEN` is the shared secret that authenticates Beast control API requests (`/v1/beasts/*` routes). The orchestrator server validates this token on protected API requests.

**How it works:**

1. In production/orchestrator-served mode, the dashboard calls same-origin backend routes and never receives the long-lived token.
2. In Vite dev mode, `vite.config.ts` reads `FRANKENBEAST_BEAST_OPERATOR_TOKEN` in Node and injects it only into same-origin proxy requests to `/v1` and `/api`.
3. Browser clients call same-origin URLs without adding `Authorization` headers from a bundled token.
4. If the server-side token is missing or invalid, the backend returns `401 UNAUTHORIZED` for protected routes.

**Server side:** For local development, the orchestrator and Vite proxy both read `FRANKENBEAST_BEAST_OPERATOR_TOKEN` from server-side env files. The browser does not read this value.

**Accepted headers** (server checks in order):
- `Authorization: Bearer <token>`
- `x-frankenbeast-operator-token: <token>`

**Security notes:**
- Never commit `.env.local` or any file containing the token
- Use a strong, random value (e.g., `openssl rand -hex 32`)
- Do not use `VITE_BEAST_OPERATOR_TOKEN` or any other `VITE_*` variable for this secret; Vite embeds `VITE_*` env values in browser-readable code

## Getting the operator token

`frankenbeast init` generates the operator token and stores it in the configured secret backend (OS keychain, 1Password, Bitwarden, or local-encrypted file). The token is printed once during `init`.

**Steps:**

1. Run `frankenbeast init` from the project root (first-time setup).
2. Copy the printed token value.
3. Set it in the repo root `.env` (preferred, shared by dashboard and orchestrator):
   ```env
   FRANKENBEAST_BEAST_OPERATOR_TOKEN=<paste-token-here>
   ```
4. Ensure the orchestrator (`frankenbeast chat-server` or `frankenbeast network`) resolves the same token — it reads it from the secret store configured via `network.secureBackend` in your config file. In Vite dev mode, keep browser requests same-origin through `VITE_API_PROXY_TARGET`/`VITE_BEAST_API_PROXY_TARGET` so the Vite server can attach the token without exposing it to the browser.

There is no dedicated `frankenbeast init --regenerate-token` flag in the current CLI. If you lose the token, rerun the supported init/repair flow for your configured secret backend or generate a new strong local development token (for example with `openssl rand -hex 32`) and update the orchestrator-side `FRANKENBEAST_BEAST_OPERATOR_TOKEN`/secret-store value so the backend and Vite proxy resolve the same server-side token.

> **Rotation note:** `resolveBeastOperatorToken()` resolves `config.network.operatorTokenRef` from the configured secret store *first*, before any env var or `.env` file. If you already ran `frankenbeast init` with an available secret backend, setting a new `FRANKENBEAST_BEAST_OPERATOR_TOKEN` alone will not take effect until you update (or delete) the secret-store entry for `operatorTokenRef`, or remove `network.operatorTokenRef` from the config, before relying on env/`.env` overrides.
