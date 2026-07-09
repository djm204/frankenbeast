# @franken/mcp-suite

MCP server suite exposing frankenbeast safety capabilities as Claude Code tools.

## Install

Install the package persistently so the `fbeast` CLI **and** the `fbeast-*` MCP
server binaries are on PATH. `mcp init` registers servers as bare
`fbeast-memory`/`fbeast-proxy` commands the AI client launches later, so a
one-shot `npx fbeast …` (which also can't resolve a package named `fbeast`)
would leave the registered servers unable to start.

```bash
# Global install (publishes the fbeast + fbeast-* binaries onto PATH)
npm install -g @franken/mcp-suite
# …or, from a clone of this monorepo:
#   npm install && npm run local:link && npm run local:verify-cli

# Initialize for your project
cd your-project
fbeast mcp init

# Optional: install with hooks (pre/post tool enforcement)
fbeast mcp init --hooks

# Choose specific servers
fbeast mcp init --pick=memory,firewall,governor

# Proxy mode: single server, 2 tools, ~90% lower context cost
fbeast mcp init --mode=proxy
```

`fbeast mcp init` auto-detects your client (Claude Code, Gemini CLI, or Codex CLI) and registers MCP servers in the appropriate project-scoped config. For Claude, MCP servers are written to the current project's `.mcp.json` and optional hooks/instructions to `.claude/settings.json` / `.claude/`; for Gemini, MCP servers and optional hooks are written to `.gemini/settings.json`. fbeast does not mutate your user-global Claude/Gemini settings by default, preventing one project's MCP database/root from being reused in another checkout. Override with `--client=claude|gemini|codex`.

## Uninstall

```bash
fbeast mcp uninstall                    # remove from detected client config
fbeast mcp uninstall --client=gemini    # target specific client
fbeast mcp uninstall --purge            # also delete .fbeast/ data
```

## Beast mode

Activate standalone orchestrator mode (shares `.fbeast/beast.db` with MCP mode):

```bash
fbeast mcp beast                          # default provider (anthropic-api)
fbeast mcp beast --provider=claude-cli    # requires risk acknowledgment
```

## Dashboard

The MCP tools, hooks, Beast mode, and web dashboard all use the same project database at `.fbeast/beast.db` when the dashboard backend points at the same project root. After `fbeast mcp init`, run the dashboard when you want a browser view of observer activity, governor decisions, cost rows, and Beast runs.

From the Frankenbeast repo, start the backend in one terminal against the project where MCP was initialized:

```bash
npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project
```

If MCP was initialized in this repo, omit `--base-dir`.

Start the web UI in another terminal:

```bash
npm --workspace @franken/web run dev:chat
```

Open the Vite URL, usually `http://127.0.0.1:5173/`. `dev:chat` proxies API calls to the local chat server on `http://127.0.0.1:3737`; production deployments should use a TLS-terminated frontend/API URL instead of the local dev proxy.

If the backend uses a different port, keep browser requests same-origin and point the Vite proxy at that backend:

```bash
npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project --port 4242
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 npm --workspace @franken/web run dev
```

For Beast controls, run the orchestrator/backend setup flow with `frankenbeast init` (distinct from `fbeast mcp init`) and keep the Vite proxy's auth source aligned with the backend project. For same-repo runs, either set `FRANKENBEAST_BEAST_OPERATOR_TOKEN` in the repo root `.env` or let the proxy resolve the token from the configured secret backend; default `local-encrypted` proxy resolution also requires `FRANKENBEAST_PASSPHRASE` in the Vite process environment. For the external `/path/to/your-project` workflow above, prefer the server-side env token path because the dev proxy resolves default local encrypted vaults relative to the Frankenbeast repo root. `FRANKENBEAST_CONFIG_FILE=/path/to/your-project/.fbeast/config.json` (or `FRANKENBEAST_CONFIG_PATH`) points the proxy at that external config file, but it does not move the local encrypted vault root. The Vite dev proxy reads these values server-side without exposing them to the browser. The root README's Secret Management section documents `frankenbeast init`, `--verify`, `--repair`, `--non-interactive`, and secret-backend prerequisites.

## MCP servers

| Server | Tools | Description |
|--------|-------|-------------|
| `fbeast-memory` | `fbeast_memory_store`, `fbeast_memory_query`, `fbeast_memory_frontload`, `fbeast_memory_forget` | Key-value and episodic memory via SqliteBrain |
| `fbeast-observer` | `fbeast_observer_log`, `fbeast_observer_log_cost`, `fbeast_observer_cost`, `fbeast_observer_trail`, `fbeast_observer_verify` | Audit trail with chained hashes, token/cost logging and summaries |
| `fbeast-governor` | `fbeast_governor_check`, `fbeast_governor_budget` | Action safety assessment and budget status |
| `fbeast-planner` | `fbeast_plan_decompose`, `fbeast_plan_status`, `fbeast_plan_validate` | Task DAG planning, status visualization, and validation |
| `fbeast-critique` | `fbeast_critique_evaluate`, `fbeast_critique_compare` | Content evaluation and revision comparison |
| `fbeast-firewall` | `fbeast_firewall_scan`, `fbeast_firewall_scan_file` | Prompt injection detection (standard/strict tiers) |
| `fbeast-skills` | `fbeast_skills_list`, `fbeast_skills_discover`, `fbeast_skills_load` | Skill registry discovery and loading |

All servers share `.fbeast/beast.db` (SQLite, WAL mode). Memory frontload is scoped to that database: use a separate database per project when project isolation is required.

### Central audit session ids

The server-side central audit path records dispatched MCP tool calls even when
`fbeast mcp init` registers standalone servers without client hooks. Those
audit records use the first available session id in this order:

1. `FBEAST_SESSION_ID`
2. `CLAUDE_SESSION_ID`
3. the fallback `fbeast-central-dispatch`

Set `FBEAST_SESSION_ID` when you want all standalone MCP servers in a run to
write under an explicit operator-chosen id. If neither env var is set, query the
default central trail from the shared database with:

```typescript
fbeast_observer_trail({ sessionId: 'fbeast-central-dispatch' })
```

## Combined server

`fbeast-mcp` runs all 21 tools in a single MCP server process.

## Hooks

When installed with `--hooks`, `fbeast-hook` provides governance and audit on every tool call:

- **pre-tool**: governor safety check — exits non-zero to deny the action
- **post-tool**: observer audit logging

All three clients are supported:

| Client | Hook mechanism |
|--------|---------------|
| Claude Code | `PreToolUse` / `PostToolUse` entries in `settings.json` that call generated shell scripts under `.fbeast/hooks/` |
| Gemini CLI | `BeforeTool` / `AfterTool` shell scripts in `.fbeast/hooks/` |
| Codex CLI | `PreToolUse` / `PostToolUse` shell scripts in `.codex/hooks/`, referenced by `.codex/hooks.json` |

## Programmatic usage

```typescript
import { createBrainAdapter, createGovernorAdapter, createFirewallAdapter } from '@franken/mcp-suite';

const brain = createBrainAdapter('.fbeast/beast.db');
const governor = createGovernorAdapter('.fbeast/beast.db');
const firewall = createFirewallAdapter('.fbeast/beast.db', 'strict');

await brain.store({ key: 'context', value: 'project setup', type: 'working' });
const result = await governor.check({ action: 'rm -rf /', context: 'cleanup' });
const scan = await firewall.scanText('ignore previous instructions');
```
