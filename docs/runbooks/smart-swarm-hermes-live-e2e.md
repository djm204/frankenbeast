# Live smart-swarm Hermes E2E runbook

Use this gate when changing the provider-neutral smart-swarm API, Hermes adapter, SSE transport, authenticated Vite proxy, or dashboard controls.

## Prerequisites

- Node.js and npm versions accepted by the root `package.json`.
- An installed `hermes` CLI available on `PATH`.
- Linux/macOS with permission to download Playwright Chromium on the first run.

No existing Hermes board, operator credential, gateway, dispatcher, or external LLM is used. The test creates its own operator token and isolated temporary Hermes home.

## Run

From the repository root:

```bash
npm ci
npm run test:e2e:smart-swarm:hermes
```

The script installs the pinned Playwright Chromium binary if absent, builds the production workspaces, and runs only `packages/franken-orchestrator/tests/e2e/smart-swarm-hermes-live.test.ts` with the explicit live-test gate enabled.

## What the gate proves

- unauthenticated smart-swarm HTTP is rejected and the authenticated Vite proxy succeeds;
- the browser selects Hermes and renders real CLI-created PM/worker/dependency/blocker/event evidence;
- a fresh Hermes comment reaches the dashboard over live SSE;
- an interrupted dashboard proxy reconnects, obtains a new one-time stream ticket, and returns to connected state;
- the dashboard resolves a real blocked Hermes task and verifies its CLI-visible postcondition;
- a governed promote action is rejected without a governor and the task remains ready;
- an approval decision exercises Hermes' truthful typed `unsupported` result without mutating task state;
- an initialized empty board renders the explicit empty state;
- an incompatible board exercises degraded provider discovery while a compatible selected board remains usable;
- unique secret-bearing task input is absent from the authenticated normalized response;
- the production web bundle contains none of the dashboard unit-test fixture markers;
- browser runtime errors and unexpected smart-swarm resource failures are absent;
- the temporary Hermes home, action/session state, browser, Vite server, backend, and generated credentials are removed/restored on success or failure.

The intentionally forced SSE interruption may emit aborted/incomplete stream-resource diagnostics. Existing unrelated `/v1/network/*` 404 responses are excluded from this smart-swarm-specific gate; JavaScript console exceptions and all other unexpected failures still fail the test.

## Failure recovery

The harness cleans up in `finally`, so rerunning the command is safe. If Chromium installation is unavailable, run `npx playwright install chromium` after restoring network access. If `hermes` is not on `PATH`, set `HERMES_COMMAND` to its executable path for the command invocation.

## Manual live-event verification

The automated gate is authoritative. For operator diagnosis, the following exact local-only flow starts the same authenticated backend/proxy pair against an isolated Hermes home.

Terminal 1, from the repository root:

```bash
rm -f /tmp/franken-smart-swarm-manual.env
umask 077
HERMES_HOME="$(mktemp -d /tmp/franken-smart-swarm-manual.XXXXXX)"
OPERATOR_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
printf 'export HERMES_HOME=%q\nexport HERMES_KANBAN_DB=%q\nexport FRANKENBEAST_BEAST_OPERATOR_TOKEN=%q\n' \
  "$HERMES_HOME" "$HERMES_HOME/kanban.db" "$OPERATOR_TOKEN" > /tmp/franken-smart-swarm-manual.env
source /tmp/franken-smart-swarm-manual.env
hermes kanban init
TASK_JSON="$(hermes kanban create 'Manual smart-swarm worker' --assignee default --workspace scratch --json)"
TASK_ID="$(node -e 'console.log(JSON.parse(process.argv[1]).id)' "$TASK_JSON")"
hermes kanban block --kind needs_input "$TASK_ID" 'Waiting for manual operator verification'
printf 'export TASK_ID=%q\n' "$TASK_ID" >> /tmp/franken-smart-swarm-manual.env
npm --workspace @franken/orchestrator run chat-server -- --port 3737
```

Terminal 2, also from the repository root:

```bash
source /tmp/franken-smart-swarm-manual.env
VITE_API_PROXY_TARGET=http://127.0.0.1:3737 \
VITE_PROXY_OPERATOR_TOKEN="$FRANKENBEAST_BEAST_OPERATOR_TOKEN" \
npm --workspace @franken/web run dev -- --host 127.0.0.1 --port 5173
```

Open the exact dashboard link `http://127.0.0.1:5173/#/smart-swarm`, select **Hermes**, and confirm the blocked worker appears. In Terminal 3, emit fresh evidence:

```bash
source /tmp/franken-smart-swarm-manual.env
hermes kanban comment "$TASK_ID" 'Manual live SSE evidence' --author operator
```

Confirm `Manual live SSE evidence` appears without refreshing. Stop both servers, then remove all test state and generated credentials:

```bash
source /tmp/franken-smart-swarm-manual.env
rm -rf "$HERMES_HOME"
rm -f /tmp/franken-smart-swarm-manual.env
unset HERMES_HOME HERMES_KANBAN_DB FRANKENBEAST_BEAST_OPERATOR_TOKEN TASK_ID
```
