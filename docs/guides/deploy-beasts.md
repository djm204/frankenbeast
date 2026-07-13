# Deploy Beasts from the Dashboard

This guide walks an operator through starting the local dashboard, creating a tracked Beast agent, dispatching a supported run, monitoring status/logs, and stopping or restarting the run.

> **Status note:** the deploy-beasts MVP is complete. The dashboard can select process/container execution, chat/API dispatch paths preserve execution mode, and live status/log streaming is wired. The standalone `beasts-daemon` is now the default Beast control-plane owner; `chat-server` remains a gateway/client for compatibility.

## What you are deploying

The dashboard talks to two local services when run through `frankenbeast network up`: `beasts-daemon` owns the secure Beast control API, while `chat-server` serves chat/WebSocket routes and can proxy Beast API requests for compatibility:

- `GET /v1/beasts/catalog` lists deployable Beast definitions.
- `POST /v1/beasts/agents` creates a tracked dashboard agent from the wizard.
- Agent actions (`start`, `stop`, `restart`, `resume`, `delete`) control the tracked agent or its linked run.
- Run detail and logs are read from `/v1/beasts/runs/:runId` and `/v1/beasts/runs/:runId/logs`.

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`, Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`), and repo dependencies installed (`npm install`).
- At least one supported CLI provider works locally for chat/execution.
- An operator token is configured so Beast control routes are enabled.
- For container mode: Docker is installed and the sandbox image exists locally (`fbeast/sandbox:latest` by default). Current main includes the in-repo `Dockerfile`, non-root user policy, resource-limit defaults, `no-new-privileges`, and optional read-only workspace support from #459.

Use the operator token already configured for the repo, or update the configured token first and then reuse that same value for the backend and Vite dev proxy. In initialized repos, the backend may resolve `network.operatorTokenRef` from the configured secret store before it reads token environment variables, so exporting a throwaway value only for the dashboard proxy can make browser requests fail with 401s.

For a new local-only setup without a stored token, generate one shell variable and reuse it for both processes:

```bash
export OPERATOR_TOKEN="$(openssl rand -hex 32)"
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN"
```

`beasts-daemon`, `chat-server`, and the Vite dev proxy discover the token from server-side env. Do not put the token in a `VITE_*` variable; Vite exposes `VITE_*` values to browser code.

## 1. Start the backend

From the repo root:

```bash
npm --workspace @franken/orchestrator run beasts-daemon
# in another terminal, for chat/WebSocket/dashboard gateway compatibility:
npm --workspace @franken/orchestrator run chat-server
```

When a live `beasts-daemon` pidfile exists, `chat-server` automatically proxies Beast control routes to the configured local daemon URL (default `http://127.0.0.1:4050`) instead of starting a second in-process Beast supervisor over the same SQLite database. If the daemon runs on a non-default local port, set `FRANKENBEAST_BEAST_DAEMON_URL` explicitly:

```bash
FRANKENBEAST_BEAST_DAEMON_URL=http://127.0.0.1:4051 \
  npm --workspace @franken/orchestrator run chat-server
```

If no daemon is running and `FRANKENBEAST_BEAST_DAEMON_URL` is unset, `chat-server` starts an in-process local Beast control plane for standalone development.

Default bind:

- Beast API: `http://127.0.0.1:4050/v1/beasts/*`
- Chat/API gateway: `http://127.0.0.1:3737`
- Chat WebSocket: `ws://127.0.0.1:3737/v1/chat/ws`
- Compatibility Beast proxy: `http://127.0.0.1:3737/v1/beasts/*`

Useful overrides:

```bash
npm --workspace @franken/orchestrator run beasts-daemon -- --port 4051
npm --workspace @franken/orchestrator run chat-server -- --port 4242
npm --workspace @franken/orchestrator run chat-server -- --provider codex
npm --workspace @franken/orchestrator run chat-server -- --allow-origin http://localhost:5173
```

If the daemon or chat server is launched by a wrapper from outside the intended checkout, pass the explicit CLI root with `--base-dir /absolute/path/to/project`. The README's [Beast project-root override](../../README.md#beast-project-root-override) documents the narrower `FBEAST_ROOT` fallback used by Beast service construction and built-in run configs when no explicit root is supplied; keep it aligned with `--base-dir` if both are set.

If you bind to a non-loopback host, the server refuses to start without an operator token. The same fail-closed rule applies when `chat-server` is launched by `frankenbeast network`: the supervisor sets the internal `FRANKENBEAST_NETWORK_MANAGED=1` child-process marker, and managed `chat-server` requires an operator token even on loopback. Do not export this marker for normal standalone debugging; unset it for local standalone `chat-server` runs, or provide `FRANKENBEAST_BEAST_OPERATOR_TOKEN` / the configured secret-store token when intentionally exercising managed semantics.

## 2. Start the dashboard

In a second terminal, either reuse the same repo-root `.env`/secret-store token or export the same local token before starting Vite so the Node-side dev proxy can inject it server-side:

```bash
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN"
npm --workspace @franken/web run dev:chat
```

If the backend is not on the local dev default `http://127.0.0.1:3737` while you are serving the dashboard with Vite, keep `VITE_API_URL` unset and point the Vite dev proxy at the backend instead. Browser REST calls then stay same-origin on `:5173`; `--allow-origin` only affects the chat WebSocket origin allowlist and does not add CORS headers for cross-origin REST requests. Production deployments should use TLS-terminated `https://`/`wss://` endpoints; plain HTTP is only appropriate for isolated local development.

Use this matrix when choosing frontend backend URL variables for local Vite development:

| Workflow | Backend layout | Set | Leave unset |
| --- | --- | --- | --- |
| Chat-only dashboard | `chat-server` serves `/api`, `/v1`, and `/v1/chat/ws` on the default `http://127.0.0.1:3737` | Nothing; `dev:chat` already targets the default backend. | `VITE_API_URL`, `VITE_API_PROXY_TARGET`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat-only dashboard on a custom backend port | `chat-server` serves `/api`, `/v1`, and `/v1/chat/ws` on a custom local URL such as `http://127.0.0.1:4242` | `VITE_API_PROXY_TARGET=http://127.0.0.1:4242` | `VITE_API_URL`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat + Beast controls through the chat server | `chat-server` handles chat routes and proxies `/v1/beasts/*` to the same backend target. | `VITE_API_PROXY_TARGET` only when `chat-server` is not on `http://127.0.0.1:3737`. | `VITE_API_URL`, `VITE_BEAST_API_PROXY_TARGET` |
| Chat + Beast controls with a separate Beast daemon | `chat-server` handles chat/API while `beasts-daemon` owns `/v1/beasts/*`. | `VITE_API_PROXY_TARGET=<chat-server-url>` and `VITE_BEAST_API_PROXY_TARGET=<beasts-daemon-url>` | `VITE_API_URL` |

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 \
VITE_BEAST_API_PROXY_TARGET=http://127.0.0.1:4051 \
  npm --workspace @franken/web run dev
```

Use this matrix to align the deploy-beasts setup with the chat dashboard guide:

| Local workflow | Backend topology | Vite env vars to set |
| --- | --- | --- |
| Dashboard chat only | Only `chat-server` is needed, typically on `http://127.0.0.1:3737` | Use `npm --workspace @franken/web run dev:chat` on defaults, or set `VITE_API_PROXY_TARGET` to the custom chat-server URL. Leave `VITE_API_URL` unset. |
| Deploy Beasts through `chat-server` compatibility proxy | `chat-server` serves chat/API routes and proxies `/v1/beasts/*` to its in-process or attached Beast control plane | Set `VITE_API_PROXY_TARGET` to the chat-server URL. Leave `VITE_BEAST_API_PROXY_TARGET` unset unless Beast routes must bypass chat-server. |
| Deploy Beasts against a separate daemon | `beasts-daemon` owns `/v1/beasts/*` on a different URL from chat/API | Set `VITE_API_PROXY_TARGET` to the chat-server URL and `VITE_BEAST_API_PROXY_TARGET` to the daemon URL. Export the same server-side `FRANKENBEAST_BEAST_OPERATOR_TOKEN` for the daemon, chat-server, and Vite proxy processes. |

Do not use `VITE_API_URL` to choose the local dashboard backend. Current local Vite development intentionally keeps browser API calls same-origin through the proxy so REST requests and operator-token injection stay server-side.

Open the Vite URL, usually `http://127.0.0.1:5173/`, and navigate to **Beasts**.

## 3. Choose a Beast and execution boundary

Current catalog entries are:

| Definition | Use when | Typical inputs |
|------------|----------|----------------|
| `design-interview` | You want the Beast to interview for requirements and produce a design. | Goal text, constraints. |
| `chunk-plan` | You already have a design doc and need chunk files. | Path to the design doc. |
| `martin-loop` | You already have chunks and want the implementation loop to execute them. | Plan/chunk path and execution settings. |

Execution boundary choices are a Beast-run concept, separate from the four toolkit deployment modes in `docs/ARCHITECTURE.md`:

| Mode | Boundary | Current dashboard status |
|------|----------|--------------------------|
| `process` | Host child process with supervised lifecycle, env allowlist, and project-root `cwd` containment. Not a hard sandbox. | Available through the dashboard tracked-agent flow for workflows whose wizard payload supplies the required definition fields. |
| `container` | Docker-backed run using `docker run --rm --network none`, one explicit workspace mount, `/workspace` working directory, non-root user policy, memory/CPU/PID limits, `no-new-privileges`, Git safe-directory config for the mounted checkout, and the same env allowlist. Not a micro-VM/gVisor/Firecracker sandbox. | Available through CLI, API, chat dispatch, and dashboard selector. |

### Container-mode CLI/API examples

The dashboard selector is available, but CLI/API calls are still useful for automation.

CLI example:

```bash
frankenbeast beasts spawn martin-loop --mode container
# or
frankenbeast beasts create martin-loop --mode container
```

API example:

```bash
curl -sS http://127.0.0.1:4050/v1/beasts/runs \
  -H "x-frankenbeast-operator-token: $OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "definitionId": "martin-loop",
    "executionMode": "container",
    "config": {
      "provider": "codex",
      "objective": "Run the implementation chunks",
      "chunkDirectory": ".fbeast/plans/my-plan/chunks"
    },
    "startNow": true
  }'
```

## 4. Create and launch from the dashboard

Use the dashboard wizard to create a tracked agent, choose the supported execution mode, launch it, and then monitor live run state/logs from the linked agent detail.

1. Open **Beasts** in the left navigation.
2. Click **Create Agent**.
3. Fill the wizard:
   - **Identity**: name/description for the tracked agent.
   - **Workflow**: choose a deployable Beast workflow and provide the required fields the dashboard renders for that definition:
     - `design-interview`: **Goal** (`goal`) and **Output Path** (`outputPath`).
     - `chunk-plan`: **Design Doc Path** (`designDocPath`) and **Output Directory** (`outputDir`). The design doc path must be repo-relative, must not contain `..` traversal, and must point to a Markdown file.
     - `martin-loop`: **Provider** (`provider`), **Objective** (`objective`), and **Chunk Directory Path** (`chunkDirectory`).
     - UI-only presets such as `issues-agent` are not deployable Beast catalog entries until their backend definition exists.
   - **LLM Targets**: select provider/model routing.
   - **Modules**: keep guardrail modules enabled unless you intentionally need a narrower run.
   - **Skills** and **Prompts**: attach context and prompt material.
   - **Git**: choose branch/worktree and PR behavior.
4. Review the generated launch config.
5. Click **Launch**.

The dashboard creates a tracked agent first. For supported tracked-agent workflows, starting the agent dispatches the linked Beast run. If the agent does not start immediately, select it in the list and click **Start** from the detail panel. If validation fails, correct the highlighted workflow field values or use the raw CLI/API run path when you need to submit a config shape the wizard does not expose.

## 5. Monitor status, events, and logs

The Beasts page refreshes approximately every four seconds while open.

Use the agent detail panel to inspect:

- current tracked-agent status (`initializing`, `dispatching`, `running`, `stopped`, `failed`, `completed`),
- init metadata and workflow config,
- agent events,
- linked run ID and attempts,
- run logs.

If you need to verify from the API:

```bash
curl -sS http://127.0.0.1:3737/v1/beasts/agents \
  -H "x-frankenbeast-operator-token: $OPERATOR_TOKEN"

curl -sS http://127.0.0.1:4050/v1/beasts/runs/<run-id>/logs \
  -H "x-frankenbeast-operator-token: $OPERATOR_TOKEN"
```

## 6. Stop, restart, resume, or delete

From the selected agent detail panel:

- **Stop** asks the linked run to stop cleanly. Use this for normal interruption.
- **Restart** starts a new attempt for a stopped/failed/completed or currently running agent.
- **Resume** resumes a tracked agent's linked run when resumable state exists.
- **Delete** soft-deletes the tracked agent from the dashboard list.

Equivalent CLI controls for raw run IDs:

```bash
frankenbeast beasts list
frankenbeast beasts status <run-id>
frankenbeast beasts logs <run-id>
frankenbeast beasts stop <run-id>
frankenbeast beasts kill <run-id>
frankenbeast beasts restart <run-id>
```

Tracked-agent-only CLI controls use agent IDs, not raw run IDs:

```bash
frankenbeast beasts resume <agent-id>
frankenbeast beasts delete <agent-id>
```

## Troubleshooting

`The catalog or agents fail with 401 in Vite dev mode`

- Make sure the backend and Vite dev server both resolve the same server-side `FRANKENBEAST_BEAST_OPERATOR_TOKEN` value.
- Keep browser requests same-origin through `VITE_API_PROXY_TARGET`/`VITE_BEAST_API_PROXY_TARGET`; do not set `VITE_BEAST_OPERATOR_TOKEN`.

`The catalog or agents fail with 401`

- The backend token and server-side proxy token differ. Use or update the configured operator token, then make the backend and Vite proxy resolve that same token for chat, network, dashboard, and Beast routes; do not assume a dummy browser env value overrides a stored backend token.

`A dashboard launch fails validation`

- Check the highlighted workflow fields before launching. `design-interview` requires `goal` and `outputPath`; `chunk-plan` requires a repo-relative Markdown `designDocPath` plus `outputDir`; `martin-loop` requires `provider`, `objective`, and `chunkDirectory`.
- For file and directory fields, browsers may expose fake paths from pickers. Enter the path the backend should resolve, such as a repo-relative design document path or the real chunk directory path, instead of relying on a browser-only fake path.
- If you need optional or advanced config fields that the wizard does not render, use the raw CLI/API run path and submit the complete config explicitly.

`Container mode fails to start`

- Verify Docker is running and the sandbox image named by the runtime policy exists locally.
- Build the default sandbox image from the repo root if it is missing: `docker build -t fbeast/sandbox:latest -f Dockerfile .`.

`The UI loads but does not connect to the backend`

- In Vite dev mode, confirm `VITE_API_PROXY_TARGET` matches the backend URL.
- If the chat WebSocket uses a non-default frontend origin, start the backend with `--allow-origin <frontend-url>`.
