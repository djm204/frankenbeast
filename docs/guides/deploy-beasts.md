# Deploy Beasts from the Dashboard

This guide walks an operator through starting the local dashboard, creating a tracked Beast agent, dispatching a run, monitoring status/logs, and stopping or killing the run.

> **Sprint status note:** this guide is written against current `origin/main` after PR #466 / issue #456 merged. Container execution exists in the Beast CLI/API, but the dashboard execution-mode selector (#457), chat/WS container dispatch wiring (#455), and sandbox image/resource hardening (#459) are still open. Until those land, the dashboard deploy flow creates and controls tracked agents through the default Beast definition execution mode. Use the CLI/API container-mode workaround below when you need an actual `container` run.

## What you are deploying

The dashboard talks to `frankenbeast chat-server`, which serves both the chat UI backend and the secure Beast control API:

- `GET /v1/beasts/catalog` lists deployable Beast definitions.
- `POST /v1/beasts/agents` creates a tracked dashboard agent from the wizard.
- Agent actions (`start`, `stop`, `restart`, `resume`, `kill`, `delete`) control the linked run.
- Run detail and logs are read from `/v1/beasts/runs/:runId` and `/v1/beasts/runs/:runId/logs`.

## Prerequisites

- Node.js >= 22 and repo dependencies installed (`npm install`).
- At least one supported CLI provider works locally for chat/execution.
- An operator token is configured so Beast control routes are enabled.
- For container mode: Docker is installed and the sandbox image exists locally (`fbeast/sandbox:latest` by default). Current main does **not** include the hardening/image work from #459 yet.

Set a local operator token in one shell and reuse the same value for the backend and frontend:

```bash
export OPERATOR_TOKEN='dev-operator-token'
export FRANKENBEAST_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN"
export VITE_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN"
```

`chat-server` also discovers the token from the repo `.env` or `packages/franken-web/.env.local` using either `FRANKENBEAST_BEAST_OPERATOR_TOKEN` or `VITE_BEAST_OPERATOR_TOKEN`.

## 1. Start the backend

From the repo root:

```bash
npm --workspace franken-orchestrator run chat-server
```

Default bind:

- API: `http://127.0.0.1:3737`
- Chat WebSocket: `ws://127.0.0.1:3737/v1/chat/ws`
- Beast API: `http://127.0.0.1:3737/v1/beasts/*`

Useful overrides:

```bash
npm --workspace franken-orchestrator run chat-server -- --port 4242
npm --workspace franken-orchestrator run chat-server -- --provider codex
npm --workspace franken-orchestrator run chat-server -- --allow-origin http://localhost:5173
```

If you bind to a non-loopback host or run in managed network mode, the server refuses to start without an operator token.

## 2. Start the dashboard

In a second terminal:

```bash
VITE_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN" \
  npm --workspace @frankenbeast/web run dev:chat
```

If the backend is not on `http://127.0.0.1:3737`, pass `VITE_API_URL`:

```bash
VITE_API_URL=http://127.0.0.1:4242 \
VITE_BEAST_OPERATOR_TOKEN="$OPERATOR_TOKEN" \
  npm --workspace @frankenbeast/web run dev
```

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
| `process` | Host child process with supervised lifecycle, env allowlist, and project-root `cwd` containment. Not a hard sandbox. | Available through the dashboard tracked-agent flow. |
| `container` | Docker-backed run using `docker run --rm --network none`, one explicit workspace mount, `/workspace` working directory, and the same env allowlist. Not a micro-VM/gVisor/Firecracker sandbox. | Available in CLI/API after #456; dashboard selector is pending #457, so use the workaround below on current main. |

### Container-mode workaround until #457 lands

To create an actual container run before the dashboard has a selector, use the CLI or Beast API, then monitor/control the run from the dashboard once it is linked or visible in run state.

CLI example:

```bash
frankenbeast beasts spawn martin-loop --mode container
# or
frankenbeast beasts create martin-loop --mode container
```

API example:

```bash
curl -sS http://127.0.0.1:3737/v1/beasts/runs \
  -H "x-frankenbeast-operator-token: $OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "definitionId": "martin-loop",
    "executionMode": "container",
    "config": { "planDir": ".fbeast/plans/my-plan/chunks" },
    "startNow": true
  }'
```

## 4. Create and launch from the dashboard

1. Open **Beasts** in the left navigation.
2. Click **Create Agent**.
3. Fill the wizard:
   - **Identity**: name/description for the tracked agent.
   - **Workflow**: choose the flow (`design-interview`, `chunk-plan`, or `martin-loop`).
   - **LLM Targets**: select provider/model routing.
   - **Modules**: keep guardrail modules enabled unless you intentionally need a narrower run.
   - **Skills** and **Prompts**: attach context and prompt material.
   - **Git**: choose branch/worktree and PR behavior.
4. Review the generated launch config.
5. Click **Launch Agent**.

The dashboard creates a tracked agent first. Starting the agent dispatches the linked Beast run. If the agent does not start immediately, select it in the list and click **Start** from the detail panel.

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

curl -sS http://127.0.0.1:3737/v1/beasts/runs/<run-id>/logs \
  -H "x-frankenbeast-operator-token: $OPERATOR_TOKEN"
```

## 6. Stop, kill, restart, resume, or delete

From the selected agent detail panel:

- **Stop** asks the run to stop cleanly. Use this first for normal interruption.
- **Kill** force-stops the run. Use this when the run is stuck or ignoring stop.
- **Restart** starts a new attempt for a stopped/failed/completed or currently running agent.
- **Resume** resumes a tracked agent's linked run when resumable state exists.
- **Delete** soft-deletes the tracked agent from the dashboard list.

Equivalent CLI controls are available for raw run IDs:

```bash
frankenbeast beasts list
frankenbeast beasts status <run-id>
frankenbeast beasts logs <run-id>
frankenbeast beasts stop <run-id>
frankenbeast beasts kill <run-id>
frankenbeast beasts restart <run-id>
frankenbeast beasts resume <agent-id>
frankenbeast beasts delete <agent-id>
```

## Troubleshooting

`The Beasts page says to set VITE_BEAST_OPERATOR_TOKEN`

- Start the frontend with `VITE_BEAST_OPERATOR_TOKEN` set.
- Make sure the backend has the same token via `FRANKENBEAST_BEAST_OPERATOR_TOKEN`, `VITE_BEAST_OPERATOR_TOKEN`, `.env`, or `packages/franken-web/.env.local`.

`The catalog or agents fail with 401`

- The frontend token and backend token differ. Use one shared token for chat, network, dashboard, and Beast routes.

`I cannot choose container mode in the dashboard`

- Expected on current main. PR #466 added CLI/API container mode; #457 is the pending dashboard execution-mode selector. Use the CLI/API workaround above until #457 merges.

`Container mode fails to start`

- Verify Docker is running and the sandbox image named by the runtime policy exists locally.
- Remember that #459 hardening/image work is still pending on current main.

`The UI loads but does not connect to the backend`

- Confirm `VITE_API_URL` matches the backend URL.
- If using a non-default origin, start the backend with `--allow-origin <frontend-url>`.
