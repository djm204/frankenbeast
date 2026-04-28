# fbeast MCP Suite — Setup & Test Walkthrough

fbeast works with any MCP-compatible AI assistant client. Currently supported:

| Client | Config dir | Hooks |
|--------|-----------|-------|
| Claude Code | `.claude/` | ✅ preToolCall / postToolCall |
| Gemini CLI | `.gemini/` | ✅ BeforeTool / AfterTool (shell scripts) |
| Codex CLI | `codex mcp add` | ✅ PreToolUse / PostToolUse (shell scripts) |

Beast mode (`fbeast beast`) is provider-agnostic: `anthropic-api`, `codex-cli`, `claude-cli`.

---

## Prerequisites

- Node.js 20+
- npm workspaces (installed at repo root)
- At least one of: Claude Code CLI, Gemini CLI, or Codex CLI
- Codex CLI (`codex --version`) — required for full-cycle integration tests

---

## Running the Tests

### Build first

The test suite runs against TypeScript source directly via `tsx`, but the monorepo
needs its internal packages linked:

```sh
npm install
npm run build
```

### All tests (every package)

```sh
npm test
```

Runs `turbo run test` across all 11 packages in dependency order.
Current baseline: **~2100 tests, 18 suites, all green**.

### MCP suite only

```sh
cd packages/franken-mcp-suite
npx vitest run --reporter=verbose
```

Or from repo root with turbo filter:

```sh
npx turbo run test --filter=@fbeast/mcp-suite
```

### Specific test files

```sh
# Unit tests only
cd packages/franken-mcp-suite
npx vitest run src/cli/init.test.ts

# Integration tests only
npx vitest run src/integration/

# The full-cycle test (requires codex binary)
npx vitest run src/integration/full-cycle.integration.test.ts
```

### Orchestrator tests

```sh
cd packages/franken-orchestrator
npx vitest run --reporter=verbose
```

### Watch mode (during development)

```sh
cd packages/franken-mcp-suite
npx vitest --reporter=verbose
```

### What the full-cycle test actually checks

`src/integration/full-cycle.integration.test.ts` exercises the real pipeline with
no mocked dependencies:

1. Verifies `codex --version` exits 0
2. `runInit()` → creates `.fbeast/beast.db`, `settings.json`, `fbeast-instructions.md`
3. Pre-tool hook (safe action) → real governor writes `approved` to `governor_log`, exit 0
4. Pre-tool hook (`rm -rf`) → real governor writes `denied` to `governor_log`, exit 1
5. Post-tool hook → real observer writes entry to `audit_trail`, verified by `session_id`
6. Brain adapter stores working memory; new adapter instance rehydrates it (cross-process persistence)
7. Observer hash chain: `parent_hash` of row N verified against `hash` of row N-1 via raw SQL
8. `SQLiteBeastRepository` creates a beast run on the same `beast.db`, reads it back
9. `sqlite_master` confirms all table namespaces coexist: `audit_trail`, `governor_log`,
   `working_memory`, `episodic_events`, `beast_runs`

---

## Installing the MCP Suite

### 1. Build the package

```sh
npm install
npm run build
```

### 2. Link the CLI globally (development install)

```sh
npm link --workspace=@fbeast/mcp-suite
```

Verify:

```sh
fbeast --help
```

### 3. Initialize in your project

Run from the root of the project you want to add fbeast to:

```sh
cd /your/project
fbeast init
```

`fbeast init` auto-detects your client by looking for `.claude/` or `.gemini/` dirs
(project-level first, then home dir). Override with `--client`:

```sh
fbeast init --client=claude    # Claude Code
fbeast init --client=gemini    # Gemini CLI
```

This creates:

```
/your/project/
├── .fbeast/
│   ├── config.json       # fbeast config (mode, servers, db path)
│   └── beast.db          # shared SQLite database (WAL mode)
└── .claude/  (or .gemini/)
    ├── settings.json     # MCP server entries added/merged
    └── fbeast-instructions.md
```

#### Install with hooks

Hooks fire `fbeast-hook` on every tool call for live governance and audit logging.
All three clients support hooks.

```sh
fbeast init --hooks                      # auto-detect client
fbeast init --client=claude --hooks      # Claude Code
fbeast init --client=gemini --hooks      # Gemini CLI
fbeast init --client=codex --hooks       # Codex CLI
```

**Claude Code** — inline command strings in `settings.json`:

```json
"hooks": {
  "preToolCall": [
    { "command": "fbeast-hook pre-tool --db \"/your/project/.fbeast/beast.db\" $TOOL_NAME" }
  ],
  "postToolCall": [
    { "command": "fbeast-hook post-tool --db \"/your/project/.fbeast/beast.db\" $TOOL_NAME $RESULT" }
  ]
}
```

**Gemini CLI** — shell scripts written to `.fbeast/hooks/`, referenced in `.gemini/settings.json`:

```json
"hooks": {
  "BeforeTool": [{ "hooks": [{ "type": "command", "command": "/your/project/.fbeast/hooks/gemini-before-tool.sh" }] }],
  "AfterTool":  [{ "hooks": [{ "type": "command", "command": "/your/project/.fbeast/hooks/gemini-after-tool.sh" }] }]
}
```

The scripts read JSON from stdin, extract `tool_name`, call `fbeast-hook`, and deny with the correct Gemini format (exit 2 + `{"decision":"deny",...}`).

**Codex CLI** — shell scripts written to `.codex/hooks/`, registered in `.codex/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/your/project/.codex/hooks/fbeast-codex-pre-tool.sh" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/your/project/.codex/hooks/fbeast-codex-post-tool.sh" }] }]
  }
}
```

The scripts read JSON from stdin and deny with the Codex format (exit 2 + `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`).

#### Install a subset of servers

```sh
fbeast init --pick=memory,observer,governor
```

Or interactive selection:

```sh
fbeast init --pick
```

Available servers: `memory`, `planner`, `critique`, `firewall`, `observer`, `governor`, `skills`

### 4. Restart your AI client

After init, restart your AI client so it picks up the new MCP registration.

- **Claude Code**: `/mcp` in the terminal to verify active servers
- **Gemini CLI**: restart the session; use `\mcp` or check session startup logs
- **Codex CLI**: `codex mcp list` to verify active servers

---

## Proxy Mode

### What it is

Proxy mode registers a single MCP server that exposes 2 meta-tools (`search_tools` and `execute_tool`) instead of 7 individual servers with 20+ full tool schemas upfront.

### When to use it

Proxy mode is ideal for large projects or agents with tight context budgets. It reduces the initial context window cost by approximately 90% because the agent only sees the two meta-tools until it actively searches for and executes a specific capability.

### How to install

```sh
fbeast init --mode=proxy
```

### What the agent sees

Only two tools in its tool list:

- `search_tools` — find tools by name or keyword
- `execute_tool` — run a tool by name with arguments

### Usage pattern

1. Agent calls `search_tools` to find a tool by name (e.g., "tools for memory")
2. Returns matching lightweight tool metadata (name and short description)
3. Agent calls `execute_tool` with the tool name and arguments
4. Proxy server dispatches to the appropriate handler and returns the result

### Default behavior

By default, `fbeast init` installs 7 individual servers with all tools visible upfront. Proxy mode is opt-in via the `--mode=proxy` flag.

---

## MCP Tools Reference

Once installed, Claude Code has access to these tools:

| Tool | Server | Description |
|------|--------|-------------|
| `fbeast_memory_frontload` | memory | Load all working + episodic memory as context |
| `fbeast_memory_store` | memory | Store a key/value entry (working or episodic) |
| `fbeast_memory_query` | memory | Search memory by keyword |
| `fbeast_memory_forget` | memory | Delete a working memory entry |
| `fbeast_plan_decompose` | planner | Break a task into a DAG of steps |
| `fbeast_plan_status` | planner | Get current plan status |
| `fbeast_critique_evaluate` | critique | Score output quality (0–1), suggest improvements |
| `fbeast_firewall_scan` | firewall | Scan input for prompt injection |
| `fbeast_observer_log` | observer | Log a tool call event to the audit trail |
| `fbeast_observer_cost` | observer | Get cost summary by model |
| `fbeast_observer_trail` | observer | Retrieve audit trail for a session |
| `fbeast_governor_check` | governor | Check whether an action should proceed |
| `fbeast_governor_budget` | governor | Get current spend against budget |
| `fbeast_skills_list` | skills | List available skills |
| `fbeast_skills_load` | skills | Load a skill by name |

---

## Switching to Beast Mode

Beast mode hands control to a standalone LLM process (codex, claude-cli, etc.)
instead of MCP tool calls. Claude Code config is left intact.

```sh
# Default provider (anthropic-api)
fbeast beast

# Explicitly choose provider
fbeast beast --provider=codex-cli
fbeast beast --provider=claude-cli
```

`claude-cli` triggers a confirmation prompt because it spawns subprocesses outside
the API billing path. `codex-cli` and `anthropic-api` skip the prompt.

After activation, `.fbeast/config.json` switches to `"mode": "beast"`.
All adapters continue reading from the same `beast.db`.

---

## Uninstalling

```sh
# Remove MCP servers and hooks, keep .fbeast/ data (auto-detects client)
fbeast uninstall

# Target a specific client
fbeast uninstall --client=claude
fbeast uninstall --client=gemini
fbeast uninstall --client=codex

# Remove everything including stored data
fbeast uninstall --purge
```

Codex: runs `codex mcp remove` for each server and clears fbeast entries from `.codex/hooks.json`.

---

## Shared Database Layout

All MCP servers, hooks, and beast runs share `.fbeast/beast.db` (WAL mode,
5 s busy timeout for multi-process safety):

| Table | Written by |
|-------|-----------|
| `working_memory` | brain adapter (`fbeast-memory`) |
| `episodic_events` | brain adapter (`fbeast-memory`) |
| `checkpoints` | beast orchestrator |
| `audit_trail` | observer adapter (`fbeast-observer`), post-tool hook |
| `cost_ledger` | observer adapter |
| `governor_log` | governor adapter (`fbeast-governor`), pre-tool hook |
| `firewall_log` | firewall adapter (`fbeast-firewall`) |
| `plans` | planner adapter (`fbeast-planner`) |
| `skill_state` | skills adapter (`fbeast-skills`) |
| `beast_runs` | `SQLiteBeastRepository` (beast mode) |
| `beast_run_attempts` | `SQLiteBeastRepository` |
| `beast_run_events` | `SQLiteBeastRepository` |
