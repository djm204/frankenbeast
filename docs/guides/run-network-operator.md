# Run the Network Operator

This guide starts Frankenbeast through the new `frankenbeast network` operator instead of running the chat server and dashboard separately.

## What It Starts

`frankenbeast network up` selects services from canonical config and starts the enabled request-serving surfaces.

When running `network up` from a service manager or wrapper whose current directory is not the target project, pass the project root explicitly with `--base-dir /absolute/path/to/project`. The README's [Beast project-root override](../../README.md#beast-project-root-override) documents the narrower `FBEAST_ROOT` fallback for Beast service construction and built-in run configs when no explicit root is supplied; keep it aligned with `--base-dir` if both are set.

Current default local surface:

- `beasts-daemon` (standalone Beast control plane on `:4050`)
- `chat-server` (chat/WebSocket backend and Beast API gateway proxy)
- `dashboard-web`

Optional surfaces activate from config:

- `comms-gateway`

## Start the Network

From the repo root:

```bash
npm --workspace @franken/orchestrator run build
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
node packages/franken-orchestrator/dist/cli/run.js network stop beasts-daemon
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

## Managed Child-Process Marker

`frankenbeast network` owns the internal `FRANKENBEAST_NETWORK_MANAGED=1` marker. The network supervisor sets it only for managed child services such as `chat-server`; operators normally should not export it before running standalone commands.

Managed children use this marker for user-visible runtime behavior:

- CLI children suppress the normal Frankenbeast startup banner so supervised logs stay focused on service output.
- `chat-server` treats managed mode as exposed even when it binds to loopback (`127.0.0.1` or `localhost`) and fails closed unless an operator token is configured.

If a standalone local `chat-server` run unexpectedly fails with an operator-token error on loopback, check for an inherited `FRANKENBEAST_NETWORK_MANAGED=1` and unset it before debugging standalone mode:

```bash
unset FRANKENBEAST_NETWORK_MANAGED
npm --workspace @franken/orchestrator run chat-server
```

When intentionally running `chat-server` with managed semantics, keep `FRANKENBEAST_NETWORK_MANAGED=1` and provide the configured operator token, for example through `FRANKENBEAST_BEAST_OPERATOR_TOKEN` or the repo's configured secret-store token reference.

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

Current default secure backend: `local-encrypted`.

Supported `network.secureBackend` values:

- `1password`
- `bitwarden`
- `os-keychain`
- `local-encrypted`

`frankenbeast network` and `frankenbeast init` use the configured `network.secureBackend` value. If the key is unset, the config schema defaults to `local-encrypted`, and interactive init may prompt for `FRANKENBEAST_PASSPHRASE` to create or open the local encrypted vault.

For production operators, prefer a managed secret backend when available, such as `1password`, `bitwarden`, or `os-keychain`. Select one explicitly in project config instead of relying on automatic backend discovery:

```bash
node packages/franken-orchestrator/dist/cli/run.js network config --set network.secureBackend=1password
```

Use `local-encrypted` for offline, CI/CD, or minimal deployments where a managed secret backend is not available.
