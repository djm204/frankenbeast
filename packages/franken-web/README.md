# @frankenbeast/web

Web dashboard for Frankenbeast — provides a browser-based operator console with chat, tracked-agent launch/detail flows, and network management.

## Quick Start

```bash
npm run dev          # Start Vite dev server (default: http://localhost:5173)
npm run dev:chat     # Start with API proxy pointing to chat-server on :3737
npm run build        # Production build (tsc + vite build)
npm run preview      # Preview production build locally
npm test             # Run tests
```

## Beast Control Surface

The `Beasts` tab is now tracked-agent based:

- launches create tracked agents via `POST /v1/beasts/agents`
- `design-doc -> chunk creation` uses a file-style path field
- `martin-loop` uses a directory-style path field
- agent detail shows init lifecycle status, startup events, linked run id, and linked run logs once dispatch occurs

Execution controls (`start`, `stop`, `restart`, `kill`) still target Beast runs after a tracked agent has dispatched.

## Environment Variables

Preferred: set shared local values in the repo root `.env` so the dashboard and `frankenbeast chat-server` read the same token.

Root `.env` example:

```env
FRANKENBEAST_BEAST_OPERATOR_TOKEN=<your-operator-token>
```

For web-only overrides, you can still create a `.env.local` file in this package directory (never committed):

```env
# Required — Base URL of the franken-orchestrator HTTP server.
# Defaults to window.location.origin if omitted (works when served by the orchestrator).
VITE_API_URL=http://localhost:3737

# Fallback for Beast control when root .env does not define FRANKENBEAST_BEAST_OPERATOR_TOKEN.
# Must match the operatorToken configured on the orchestrator server.
# Without this, the Beasts tab shows: "Set VITE_BEAST_OPERATOR_TOKEN to use the secure Beast control API."
VITE_BEAST_OPERATOR_TOKEN=<your-operator-token>

# Optional — Project identifier for scoping chat sessions. Defaults to "default".
VITE_PROJECT_ID=my-project
```

### `VITE_BEAST_OPERATOR_TOKEN`

A shared secret that authenticates the web dashboard to the Beast control API (`/v1/beasts/*` routes). The orchestrator server validates this token on every Beast API request.

**How it works:**

1. The web app reads the token from `import.meta.env.VITE_BEAST_OPERATOR_TOKEN` at build/dev time
2. `BeastApiClient` sends it as `Authorization: Bearer <token>` on every request to `/v1/beasts/*`
3. The orchestrator's `requireBeastOperatorAuth` middleware verifies it using `TransportSecurityService.verifyOperatorToken()`
4. If the token is missing or invalid, the server returns `401 UNAUTHORIZED`

**Server side:** For local development, the orchestrator prefers `FRANKENBEAST_BEAST_OPERATOR_TOKEN` from the repo root `.env`, then falls back to `packages/franken-web/.env.local`. Both sides must resolve to the same value.

**Accepted headers** (server checks in order):
- `Authorization: Bearer <token>`
- `x-frankenbeast-operator-token: <token>`

**Security notes:**
- Never commit `.env.local` or any file containing the token
- Use a strong, random value (e.g., `openssl rand -hex 32`)
- The token is embedded in the Vite build output — treat production bundles accordingly

## Getting the operator token

`frankenbeast init` generates the operator token and stores it in the configured secret backend (OS keychain, 1Password, Bitwarden, or local-encrypted file). The token is printed once during `init`.

**Steps:**

1. Run `frankenbeast init` from the project root (first-time setup).
2. Copy the printed token value.
3. Set it in the repo root `.env` (preferred, shared by dashboard and orchestrator):
   ```env
   FRANKENBEAST_BEAST_OPERATOR_TOKEN=<paste-token-here>
   ```
   Or, for dashboard-only override, set it in `packages/franken-web/.env.local` (never committed):
   ```env
   VITE_BEAST_OPERATOR_TOKEN=<paste-token-here>
   ```
4. Ensure the orchestrator (`frankenbeast chat-server` or `frankenbeast network`) resolves the same token — it reads it from the secret store configured via `network.secureBackend` in your config file.

If you lose the token, run `frankenbeast init --regenerate-token` to rotate it (updates both the secret store and prints the new value).
