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

Proxy mode protects file-backed tools when it cannot identify a project root. If
`fbeast-proxy` is launched with a standalone database path outside
`<project>/.fbeast/beast.db` and no explicit root, file-backed tools such as
`fbeast_firewall_scan_file` fail closed in protected mode instead of treating the
process cwd as trusted. Start the server with `--root /absolute/project/root` or
use a `.fbeast/beast.db` path under the initialized project to enable those tools
with project-root containment.

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

If the backend uses a different port, keep browser requests same-origin and point the Vite proxy at that backend. Leave `VITE_API_URL` unset for local Vite development; use `VITE_API_PROXY_TARGET` for chat/API traffic and `VITE_BEAST_API_PROXY_TARGET` when Beast controls run on a separate backend:

```bash
npm --workspace @franken/orchestrator run chat-server -- --base-dir /path/to/your-project --port 4242
VITE_API_PROXY_TARGET=http://127.0.0.1:4242 npm --workspace @franken/web run dev
```

For Beast controls, run the orchestrator/backend setup flow with `frankenbeast init` (distinct from `fbeast mcp init`) and keep the Vite proxy's auth source aligned with the backend project. For same-repo runs, either set `FRANKENBEAST_BEAST_OPERATOR_TOKEN` in the repo root `.env` or let the proxy resolve the token from the configured secret backend; default `local-encrypted` proxy resolution also requires `FRANKENBEAST_PASSPHRASE` in the Vite process environment. For the external `/path/to/your-project` workflow above, prefer the server-side env token path because the dev proxy resolves default local encrypted vaults relative to the Frankenbeast repo root. `FRANKENBEAST_CONFIG_FILE=/path/to/your-project/.fbeast/config.json` (or `FRANKENBEAST_CONFIG_PATH`) points the proxy at that external config file, but it does not move the local encrypted vault root. The Vite dev proxy reads these values server-side without exposing them to the browser. The root README's Secret Management section documents `frankenbeast init`, `--verify`, `--repair`, `--non-interactive`, and secret-backend prerequisites.

## MCP servers

| Server | Tools | Description |
|--------|-------|-------------|
| `fbeast-memory` | `fbeast_memory_store`, `fbeast_memory_query`, `fbeast_memory_frontload`, `fbeast_memory_export`, `fbeast_memory_forget`, `fbeast_memory_right_to_forget`, `fbeast_memory_review_propose`, `fbeast_memory_review_list`, `fbeast_memory_review_decide` | Key-value, episodic, redacted project export, review-queued promotion, and auditable deletion memory via SqliteBrain |
| `fbeast-observer` | `fbeast_observer_log`, `fbeast_observer_log_cost`, `fbeast_observer_cost`, `fbeast_observer_trail`, `fbeast_observer_verify` | Audit trail with chained hashes, token/cost logging and summaries |
| `fbeast-governor` | `fbeast_governor_check`, `fbeast_governor_budget` | Action safety assessment and budget status |
| `fbeast-planner` | `fbeast_plan_decompose`, `fbeast_plan_status`, `fbeast_plan_validate` | Task DAG planning, status visualization, and validation |
| `fbeast-critique` | `fbeast_critique_evaluate`, `fbeast_critique_compare` | Content evaluation and revision comparison |
| `fbeast-firewall` | `fbeast_firewall_scan`, `fbeast_firewall_scan_file` | Prompt injection detection (standard/strict tiers) |
| `fbeast-skills` | `fbeast_skills_list`, `fbeast_skills_discover`, `fbeast_skills_load` | Skill registry discovery and loading |

All servers share `.fbeast/beast.db` (SQLite, WAL mode). Memory frontload is scoped to that database: use a separate database per project when project isolation is required.

Memory reads support explicit per-agent scope controls on `fbeast_memory_query` and `fbeast_memory_frontload`:

- omit `readScope` or set `readScope: "all"` for legacy behavior;
- set `readScope: "shared"` to hide entries stored under an agent namespace;
- set `readScope: "agent"` with `agentId` to return shared entries plus entries for that agent only.

To create agent-scoped entries through `fbeast_memory_store`, pass `agentId`; working-memory entries are stored under an internal reserved key with explicit scope metadata, and episodic entries carry the same metadata in event details. `fbeast_memory_forget` accepts the same optional `agentId` so callers can delete scoped working-memory entries using the logical key they stored. `readScope: "agent"` requires a non-empty `agentId` and rejects the request before touching memory when the id is missing, making failures deterministic and preventing accidental broad reads.

`fbeast_memory_store` quarantines likely sensitive working-memory writes instead of storing them directly when the key or value looks like a secret (for example API keys, private keys, passwords, passphrases, credentials, or explicit access/refresh/auth/bearer tokens). The tool returns structured non-sensitive quarantine metadata (`status`, candidate `id`, logical `key`, optional `agentId`, reason, and `stored: false`) without echoing the value. Operators can inspect the pending candidate with `fbeast_memory_review_list` and then approve, reject, or `never_store` it with `fbeast_memory_review_decide`; approval is the only path that persists the quarantined value into working memory, preserving the original agent scope when `agentId` was supplied. Repeated writes that match a prior rejection or `never_store` suppression report the suppressed status instead of returning a decider action. Benign operational notes such as token-budget guidance continue down the direct store path.

`fbeast_memory_export` returns a structured JSON export of the same database-scoped project memory with `redaction: "safe"` by default. Safe redaction masks sensitive keys and values such as passwords, API keys, bearer tokens, session cookies, private keys, and email addresses before returning working and episodic memory entries. Use `redaction: "none"` only for trusted operator-only exports; `readScope` and `agentId` use the same scope rules as query/frontload.

`fbeast_memory_right_to_forget` performs user-directed memory deletion by exact key, category metadata, source scope, or sensitive query text. The report returns only a selector hash, deleted counts, remaining-reference count, and optional audit event id; it does not echo the deleted content. Non-dry-run deletions also install hashed reinference guards so future working-memory writes matching forgotten keys, categories, source scopes, or query tokens are rejected.

### Skill health endpoint

When the dashboard backend is started with a configured skill manager, the skills API exposes a per-skill health probe at:

```text
GET /api/skills/:name/health
```

Example against the local chat server:

```bash
curl http://127.0.0.1:3737/api/skills/github/health
```

Response shape:

```json
{
  "health": {
    "name": "github",
    "status": "unknown",
    "serverStatuses": [
      {
        "serverName": "github",
        "status": "unknown",
        "error": "MCP health check command was not executed because the skill is not trusted"
      }
    ]
  }
}
```

`status` is an aggregate of the per-server statuses emitted by `SkillHealthChecker`:

- `connected`: every trusted MCP server probe exited cleanly during the short health check.
- `error`: at least one trusted probe failed to spawn or exited non-zero.
- `unknown`: the server could not be safely or conclusively probed. This is the normal API response for command-based skills because the public endpoint is passive and does not execute commands from skill manifests. It can also mean a long-running MCP server stayed alive without a readiness signal.

The endpoint is intentionally passive: it reads the skill's `mcp.json` and returns the checker response without spawning the manifest command. Custom adapters can consume the JSON shape (`health.name`, aggregate `health.status`, and `health.serverStatuses[]`) to render status badges or block automation when a required server is `error`. If an adapter runs `SkillHealthChecker` directly in a trusted local context, only pass `trustMcpServerCommands: true` for skill directories you control.

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

### Tamper-evident audit chain

`fbeast_observer_log` stores each audit row with a SHA-256 hash that binds the
session id, event type, exact stored payload bytes, and the previous row's hash.
The `audit_trail` table is append-only by default: direct `UPDATE` and `DELETE`
statements are rejected by SQLite triggers, and the only code path that unlocks
mutation is the internal legacy-hash migration used by `fbeast_observer_verify`.
There is no operator flag to rewrite history; if a row is corrupted, append a
new explanatory event and keep the broken row for forensics.

Use `fbeast_observer_verify({ sessionId })` before relying on a trail. A clean
result means every row in that session still matches the hash chain. A failure
reports the first invalid index so operators can inspect that row without dumping
sensitive payloads into logs or issue comments.

## Combined server

`fbeast-mcp` runs all 26 tools in a single MCP server process.

## Tool argument shape hardening

All MCP server and proxy dispatch paths validate tool arguments before governance
or handlers run. Arguments must be plain JSON objects and may not contain the
prototype-pollution key denylist (`__proto__`, `prototype`, or `constructor`) at
any nested level. Accessor properties and non-plain objects are rejected as
unsafe shapes instead of being inspected, so operator error messages name the
invalid shape/key without echoing nested payload values. To intentionally pass
arbitrary content, encode it as a string value accepted by the target tool schema
rather than adding dynamic object keys.

## Testing

```bash
# Unit tests
npm test

# Full-cycle integration tests (real SQLite/adapters; no mocked integration seams)
npm run test:integration

# Watch mode
npm run test:watch
```

`test:integration` targets the package's `src/**/*.integration.test.ts` files, including the full-cycle MCP suite. The suite runs deterministically without a Codex CLI installation: Codex-specific prerequisite assertions are skipped when the `codex` binary is unavailable, while the remaining database and adapter integration checks still execute.

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
