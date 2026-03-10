# Run the Network Operator

This guide starts Frankenbeast through the new `frankenbeast network` operator instead of running the chat server and dashboard separately.

## What It Starts

`frankenbeast network up` selects services from canonical config and starts the enabled request-serving surfaces.

Current default local surface:

- `chat-server`
- `dashboard-web`

Optional surfaces activate from config:

- `comms-gateway`

## Start the Network

From the repo root:

```bash
npm --workspace franken-orchestrator run build
node packages/franken-orchestrator/dist/cli/run.js network up
```

Foreground mode is the default. It keeps the operator attached to the child services and shuts them down on `Ctrl+C`.

Detached mode:

```bash
node packages/franken-orchestrator/dist/cli/run.js network up -d
```

## Check Status

```bash
node packages/franken-orchestrator/dist/cli/run.js network status
```

## Stop or Restart Services

```bash
node packages/franken-orchestrator/dist/cli/run.js network stop chat-server
node packages/franken-orchestrator/dist/cli/run.js network restart dashboard-web
node packages/franken-orchestrator/dist/cli/run.js network down
```

## Dashboard Access

When the dashboard service is up, open:

```text
http://127.0.0.1:5173/#/chat
http://127.0.0.1:5173/#/network
```

`#/chat` is the live chat workspace.
`#/network` is the operator page for service state, logs, and config edits.

## CLI Chat Attachment

If the managed chat service is healthy, `frankenbeast chat` now attaches to that running chat service instead of spinning up a parallel local runtime.

If the managed chat service is not healthy, `frankenbeast chat` falls back to standalone mode.

## Config Updates

Inspect current operator-facing config:

```bash
node packages/franken-orchestrator/dist/cli/run.js network config
```

Apply a config update:

```bash
node packages/franken-orchestrator/dist/cli/run.js network config --set chat.model=claude-sonnet-4-6
```

Sensitive values should be stored as refs, not plaintext values.

## Security Modes

Default mode is `secure`.

Supported mode values:

- `secure`
- `insecure`

Current secure backend preference order:

1. `1Password`
2. `Bitwarden`
3. OS secure store
4. local encrypted store

The local encrypted store is allowed, but it is not the optimal solution.
