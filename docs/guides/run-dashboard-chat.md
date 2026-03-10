# Run the Dashboard Chat Locally

This guide starts the Frankenbeast dashboard chat with the real CLI-chat-compatible backend.

## What you are starting

- `franken-orchestrator` runs the backend HTTP and WebSocket chat server
- `franken-web` runs the dashboard UI in Vite
- the web chat uses the same chat runtime semantics as `frankenbeast chat`

## Prerequisites

- Node.js >= 22
- `npm install` has already been run at the repo root
- at least one supported CLI chat provider is configured locally

If you normally run `frankenbeast chat`, use the same provider setup here. By default the server uses `claude`. You can override that with `--provider <name>` or `--config <path>`.

## 1. Start the chat server

From the repo root:

```bash
npm --workspace franken-orchestrator run chat-server
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
npm --workspace franken-orchestrator run chat-server -- --port 4242
npm --workspace franken-orchestrator run chat-server -- --host 0.0.0.0 --port 4242
npm --workspace franken-orchestrator run chat-server -- --allow-origin http://localhost:5173
npm --workspace franken-orchestrator run chat-server -- --provider codex
```

## 2. Start the dashboard UI

In a second terminal:

```bash
npm --workspace @frankenbeast/web run dev:chat
```

That points the frontend at `http://127.0.0.1:3737`.

If your backend is on a different port, set `VITE_API_URL` explicitly:

```bash
VITE_API_URL=http://127.0.0.1:4242 npm --workspace @frankenbeast/web run dev
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

- make sure the backend is running on the same URL as `VITE_API_URL`
- check that the backend printed the expected localhost URL
- if you changed host or port, update `VITE_API_URL` to match

`WebSocket is rejected from another origin`

- that is expected unless you started the backend with `--allow-origin <url>`

## Known local run path

This is the default, verified setup:

```bash
npm --workspace franken-orchestrator run chat-server
npm --workspace @frankenbeast/web run dev:chat
```
