# Run the Dashboard Chat Locally

This guide starts the Frankenbeast dashboard chat with the real CLI-chat-compatible backend.

## What you are starting

- `@franken/orchestrator` runs the backend HTTP and WebSocket chat server
- `franken-web` runs the dashboard UI in Vite
- the web chat uses the same chat runtime semantics as `frankenbeast chat`

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`)
- `npm install` has already been run at the repo root
- at least one supported CLI chat provider is configured locally

If you normally run `frankenbeast chat`, use the same provider setup here. The server reads `.fbeast/config.json` by default. An explicit `--provider <name>` wins over `providers.default`; an explicit `--providers <comma-separated-list>` wins over `providers.fallbackChain`. Use `--config <path>` to load a different JSON config.

### Provider and model overrides

For a one-off provider switch, pass a registered CLI provider name (`claude`, `codex`, `gemini`, or `aider`):

```bash
npm --workspace @franken/orchestrator run chat-server -- --provider codex
npm --workspace @franken/orchestrator run chat-server -- --provider claude --providers codex,gemini
```

For a persistent selection, update the config used by the server:

```json
{
  "providers": {
    "default": "claude",
    "fallbackChain": ["claude", "codex"],
    "overrides": {
      "claude": {
        "extraArgs": ["--verbose"]
      }
    }
  },
  "chat": {
    "model": "claude-sonnet-4-6"
  }
}
```

`providers.overrides.<provider>.extraArgs` changes that provider's CLI arguments for conversational replies. For those replies, `providers.overrides.<selected-provider>.model` has the highest model precedence. When that field is absent, optional `chat.model` overrides the provider's built-in chat model. Remove a stale selected-provider model override (or set it to the same value) when changing `chat.model`.

Dashboard `/run` uses the selected provider's execution adapter, not the conversational adapter. Its spawned agent uses the provider's built-in/default model; `chat.model`, provider `model`, and provider `extraArgs` do not change `/run` execution. A trusted provider `command` override does apply to both paths. Keep provider credentials in the provider's normal environment or credential store, not in this JSON file.

Command overrides are intentionally fail-closed. Do not add `command` when the provider's normal binary is sufficient. To use a wrapper or nonstandard binary, put the override in an explicit operator-owned config outside the repository, set `trustCommandOverride: true`, restrict an absolute wrapper path with `trustedCommandPaths`, and start the server with both `--config <operator-config.json>` and `--trust-provider-command-overrides`:

```json
{
  "providers": {
    "default": "codex",
    "fallbackChain": [],
    "overrides": {
      "codex": {
        "command": "/opt/frankenbeast/bin/codex-wrapper",
        "trustCommandOverride": true,
        "trustedCommandPaths": ["/opt/frankenbeast/bin"]
      }
    }
  }
}
```

```bash
npm --workspace @franken/orchestrator run chat-server -- \
  --config "$HOME/.config/frankenbeast/dashboard-chat.json" \
  --trust-provider-command-overrides
```

Repository-local config cannot approve its own command override: trust fields in `.fbeast/config.json` are stripped, and combining repo-local trust fields with the CLI approval flag is rejected. This prevents a checked-out project from selecting an executable merely because the server was started inside that project.

## 1. Start the chat server

From the repo root:

```bash
npm --workspace @franken/orchestrator run chat-server
```

Default bind:

- host: `127.0.0.1`
- port: `3737`

When the server is ready, it prints:

```text
Chat server listening on http://127.0.0.1:3737
```

Useful overrides:

```bash
npm --workspace @franken/orchestrator run chat-server -- --port 4242
npm --workspace @franken/orchestrator run chat-server -- --host 0.0.0.0 --port 4242
npm --workspace @franken/orchestrator run chat-server -- --allow-origin http://localhost:5173
npm --workspace @franken/orchestrator run chat-server -- --provider codex
```

## 2. Start the dashboard UI

In a second terminal:

```bash
npm --workspace @franken/web run dev:chat
```

That proxies same-origin browser requests to `http://127.0.0.1:3737`; production deployments should use TLS-terminated `https://` and `wss://` endpoints.

The dashboard scopes chat history by project id. If `VITE_PROJECT_ID` is unset, the frontend uses the shared `default` project. Set a stable, non-secret project id when you run multiple local checkouts or want dashboard chat sessions isolated by project. Export it in the shell that starts Vite, or put it in `packages/franken-web/.env.local`; the repo-root `.env` is server-side and will not populate Vite's browser bundle:

```bash
VITE_PROJECT_ID=my-project npm --workspace @franken/web run dev:chat
```

`VITE_PROJECT_ID` is bundled into the browser, so use only a plain identifier such as a repo or workspace slug; do not put secrets in it.

If your backend is on a different port, keep browser requests same-origin and set the Vite proxy target. Leave `VITE_API_URL` unset in local Vite development; the current dashboard ignores that legacy value, so it will not change the backend port. Use `VITE_API_PROXY_TARGET` instead so `/v1` and `/api` stay on the Vite origin while the dev server forwards them to the backend.

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 npm --workspace @franken/web run dev
```

Use this matrix when choosing frontend backend URL variables for local Vite development:

| Workflow | Backend layout | Set | Leave unset |
| --- | --- | --- | --- |
| Chat-only dashboard | `chat-server` serves `/api`, `/v1`, and `/v1/chat/ws` on the default `http://127.0.0.1:3737` | Nothing; `dev:chat` already targets the default backend. | `VITE_API_URL`, `VITE_API_PROXY_TARGET`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat-only dashboard on a custom backend port | `chat-server` serves `/api`, `/v1`, and `/v1/chat/ws` on a custom local URL such as `http://127.0.0.1:4242` | `VITE_API_PROXY_TARGET=http://127.0.0.1:4242` | `VITE_API_URL`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat + Beast controls through the chat server | `chat-server` handles chat routes and proxies `/v1/beasts/*` to the same backend target. | `VITE_API_PROXY_TARGET` only when `chat-server` is not on `http://127.0.0.1:3737`. | `VITE_API_URL`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat + Beast controls with a separate Beast daemon | `chat-server` handles chat/API while `beasts-daemon` owns `/v1/beasts/*`. | `VITE_API_PROXY_TARGET=<chat-server-url>` and `VITE_BEAST_API_PROXY_TARGET=<beasts-daemon-url>` | `VITE_API_URL` |

`VITE_BEAST_API_PROXY_TARGET` only affects Beast control routes (`/v1/beasts/*`). It defaults to `VITE_API_PROXY_TARGET`, so leave it unset when chat/API and Beast controls share the same backend. Set it only when Beast controls run on a separate local daemon or backend target.

In all local Vite workflows, leave `VITE_API_URL` unset. It is reserved/legacy and does not select the dashboard backend in current local development.

Set `VITE_PROJECT_ID` when you want dashboard chat sessions scoped to a named local project instead of the shared `default` namespace. The frontend passes that value to the chat session API when it lists and resumes sessions, so using a stable per-project value such as `my-project` keeps parallel local checkouts from mixing dashboard chat history. Leave it unset only when the fallback `default` project id is acceptable. Set it inline with the Vite command or in `packages/franken-web/.env.local`; the root `.env.example` intentionally omits a runnable example because the workspace Vite script loads browser env from the web package directory.

If you use a separate Beast daemon, start that daemon before `chat-server` so the chat backend can attach to it during startup. The daemon and Vite proxy also need the server-side Beast operator token generated by `frankenbeast init`; export it in each terminal or put `FRANKENBEAST_BEAST_OPERATOR_TOKEN=<token>` in the repo root `.env` before starting these processes:

```bash
# Terminal 1: start the separate Beast daemon.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
npm --workspace @franken/orchestrator run beasts-daemon -- --port 4051

# Terminal 2: start chat-server after the daemon is listening.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
FRANKENBEAST_BEAST_DAEMON_URL=http://127.0.0.1:4051 \
  npm --workspace @franken/orchestrator run chat-server

# Terminal 3: keep chat/API on the started chat server and Beast routes on the daemon.
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="<token-from-frankenbeast-init>"
VITE_API_PROXY_TARGET=http://127.0.0.1:3737 \
VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4051 \
VITE_PROJECT_ID=my-project \
  npm --workspace @franken/web run dev
```

If you start chat-server with `--port 4242` instead of the default, set `VITE_API_PROXY_TARGET=http://127.0.0.1:4242` so non-Beast `/v1` and `/api` requests still proxy to the chat server you started.

Open the URL Vite prints, usually:

```text
http://127.0.0.1:5173/
```

## 3. Verify the connection

Expected behavior:

- the dashboard loads with the Frankenbeast shell
- opening the chat page creates or resumes a session over HTTP
- the UI then opens a WebSocket connection to `/v1/chat/ws`
- sending a message streams assistant output back into the transcript
- WebSocket stream events include monotonic `eventId` values so reconnect/replay paths can ignore duplicate or stale events without duplicating transcript entries
- dashboard SSE snapshots include monotonic `id: dashboard:<n>` fields; reconnecting clients pass their last processed id as `lastEventId` when minting the next short-lived stream, and client reducers must ignore duplicate event ids
- approvals show up in the side rail when a turn requires them

## Security defaults

The local server is intentionally conservative by default:

- it binds to `127.0.0.1`, not `0.0.0.0`
- WebSocket transport is same-host by default
- cross-origin access is not opened unless you pass `--allow-origin`
- the browser receives a signed session socket token, not a raw session subscription

Only bind to `0.0.0.0` when you actually need remote access.

Approval replay also fails closed on model-derived command text that looks like
control input rather than a single command description. Stored pending approvals
with multiline/control-character payloads or a leading chat slash command are not
executed when the operator clicks Approve; reject that approval and submit a
fresh explicit `/run <command>` if you intentionally need to override it.

Governor approval prompts sent through CLI and Slack include request-bound
`FRANKENBEAST_APPROVAL_PROMPT` BEGIN/END markers. Treat only the context between
the matching markers for the displayed request ID as the trusted approval prompt;
summary and plan text inside that block is still quoted as untrusted model output,
and marker-looking text nested there must not be treated as a real prompt boundary.

## Troubleshooting

`The server starts but chat replies fail`

- verify the selected CLI provider works directly and is authenticated, then verify it with `frankenbeast chat`
- pass `--provider <name>` explicitly to distinguish a bad `providers.default` from a provider runtime failure
- if fallback selection is unexpected, pass `--providers <comma-separated-list>` explicitly and check `providers.fallbackChain`
- if you use a config file, pass `--config <path>` and confirm provider settings are under top-level `providers`; when used, the optional conversation-model override belongs at `chat.model`
- if `chat.model` appears to be ignored for a conversational reply, check `providers.overrides.<selected-provider>.model`, which takes precedence; neither model setting changes `/run` execution
- if a command override is refused, do not weaken repository config; use the operator-owned config and explicit trust flow above

`The UI loads but does not connect`

- make sure the backend is running on the same URL as `VITE_API_PROXY_TARGET`
- if Beast routes use a separate server, make sure `VITE_BEAST_API_PROXY_TARGET` matches that URL
- check that the backend printed the expected localhost URL
- if you changed host or port, update the proxy env vars to match
- do not try to fix local Vite-dev REST failures by setting `VITE_API_URL`; keep requests same-origin through the proxy

`WebSocket is rejected from another origin`

- that is expected unless you started the backend with `--allow-origin <url>`

## Known local run path

This is the default, verified setup:

```bash
npm --workspace @franken/orchestrator run chat-server
npm --workspace @franken/web run dev:chat
```
