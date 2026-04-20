# fbeast MCP Suite — Setup & Test Walkthrough

## Prerequisites

- Node.js 20+
- npm workspaces (installed at repo root)
- Claude Code CLI
- Codex CLI (`codex --version` should work) — required for full-cycle integration tests

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

This creates:

```
/your/project/
├── .fbeast/
│   ├── config.json       # fbeast config (mode, servers, db path)
│   └── beast.db          # shared SQLite database (WAL mode)
└── .claude/              # or ~/.claude/ if no project-level .claude/
    ├── settings.json     # MCP server entries added/merged
    └── fbeast-instructions.md
```

#### Install with Claude Code hooks

Hooks fire `fbeast-hook` on every tool call for live governance and audit logging:

```sh
fbeast init --hooks
```

Adds to `settings.json`:

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

#### Install a subset of servers

```sh
fbeast init --pick=memory,observer,governor
```

Or interactive selection:

```sh
fbeast init --pick
```

Available servers: `memory`, `planner`, `critique`, `firewall`, `observer`, `governor`, `skills`

### 4. Restart Claude Code

After init, restart Claude Code (or reload the MCP server list) so it picks up the
new entries in `settings.json`.

You can verify servers are active with `/mcp` in the Claude Code terminal.

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
# Remove MCP servers and hooks from settings.json, keep .fbeast/ data
fbeast uninstall

# Remove everything including stored data
fbeast uninstall --purge
```

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
