# Run the Dashboard Chat Locally

This guide starts the Frankenbeast dashboard chat with the real CLI-chat-compatible backend.

## What you are starting

- `@franken/orchestrator` runs the backend HTTP and WebSocket chat server
- `franken-web` runs the dashboard UI in Vite
- the web chat uses the same chat runtime semantics as `frankenbeast chat`

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- `npm install` has already been run at the repo root
- at least one supported CLI chat provider is configured locally

If you normally run `frankenbeast chat`, use the same provider setup here. By default the server uses `claude`. You can override that with `--provider <name>` or `--config <path>`.

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

If your backend is on a different port, keep browser requests same-origin and set the Vite proxy target. Leave `VITE_API_URL` unset in local Vite development; the current dashboard ignores that legacy value, so it will not change the backend port. Use `VITE_API_PROXY_TARGET` instead so `/v1` and `/api` stay on the Vite origin while the dev server forwards them to the backend. If Beast controls run on a separate backend, set `VITE_BEAST_API_PROXY_TARGET` as well.

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 \
VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4050 \
  npm --workspace @franken/web run dev
```

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
- approvals show up in the side rail when a turn requires them

## Security defaults

The local server is intentionally conservative by default:

- it binds to `127.0.0.1`, not `0.0.0.0`
- WebSocket transport is same-host by default
- cross-origin access is not opened unless you pass `--allow-origin`
- the browser receives a signed session socket token, not a raw session subscription

Only bind to `0.0.0.0` when you actually need remote access.

## Troubleshooting

`The server starts but chat replies fail`

- verify your configured CLI provider works with `frankenbeast chat`
- try passing `--provider <name>` explicitly
- if you use a config file, pass `--config <path>`

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
