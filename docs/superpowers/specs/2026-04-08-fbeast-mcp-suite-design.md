# fbeast MCP Suite — Design Spec

**Date:** 2026-04-08
**Status:** Draft
**ADR Context:** ADR-031 (Architecture Consolidation — Provider-Agnostic Agent Framework)

## Problem

Frankenbeast spawns Claude CLI as subprocess — multiple instances, `--dangerously-skip-permissions`, env var stripping. Anthropic banning this pattern. Full API path works but expensive.

## Solution

Dual-mode distribution:

1. **MCP Mode** — Suite of MCP servers Claude Code calls as tools. ToS compliant. Free (user's own subscription). Gateway to frankenbeast ecosystem.
2. **Beast Mode** — Full orchestrator with BeastLoop. CLI provider available with explicit risk warning. API providers recommended.

Both modes share `.fbeast/beast.db` — data carries across modes.

---

## Architecture

### Package: `@fbeast/mcp-suite`

Single package, multiple entry points. Each server wraps existing frankenbeast module as MCP tools via `@modelcontextprotocol/sdk`.

```
packages/franken-mcp-suite/
├── src/
│   ├── servers/
│   │   ├── memory.ts          # wraps @frankenbeast/brain
│   │   ├── planner.ts         # wraps @frankenbeast/planner
│   │   ├── critique.ts        # wraps @frankenbeast/critique
│   │   ├── firewall.ts        # wraps orchestrator middleware
│   │   ├── observer.ts        # wraps @frankenbeast/observer
│   │   ├── governor.ts        # wraps @frankenbeast/governor
│   │   └── skills.ts          # wraps orchestrator skill-manager
│   ├── shared/
│   │   ├── sqlite-store.ts    # shared WAL-mode SQLite layer
│   │   ├── config.ts          # .fbeast/ directory management
│   │   └── server-factory.ts  # MCP server boilerplate
│   ├── cli/
│   │   ├── init.ts            # auto-inject MCP config + instructions
│   │   ├── uninstall.ts       # clean removal, no trace
│   │   └── main.ts            # entry point router
│   └── beast.ts               # start all servers
├── instructions/
│   └── fbeast-instructions.md # Claude Code guidance file
├── package.json
└── tsconfig.json
```

### Binary Entry Points

```json
{
  "bin": {
    "fbeast-mcp": "./dist/beast.js",
    "fbeast-memory": "./dist/servers/memory.js",
    "fbeast-planner": "./dist/servers/planner.js",
    "fbeast-critique": "./dist/servers/critique.js",
    "fbeast-firewall": "./dist/servers/firewall.js",
    "fbeast-observer": "./dist/servers/observer.js",
    "fbeast-governor": "./dist/servers/governor.js",
    "fbeast-skills": "./dist/servers/skills.js",
    "fbeast-init": "./dist/cli/init.js",
    "fbeast-uninstall": "./dist/cli/uninstall.js"
  }
}
```

---

## MCP Tool Surface

All tool names prefixed `fbeast_` for uniqueness.

### fbeast-memory (wraps SqliteBrain)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_memory_query` | `{ query, type?, limit? }` | matching memory entries |
| `fbeast_memory_store` | `{ key, value, type }` | confirmation + id |
| `fbeast_memory_frontload` | `{ projectId }` | full context (ADRs, rules, known errors) |
| `fbeast_memory_forget` | `{ key }` | confirmation |

### fbeast-planner (wraps Planner / GraphBuilder)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_plan_decompose` | `{ objective, constraints? }` | DAG of tasks (JSON) |
| `fbeast_plan_visualize` | `{ planId }` | markdown/mermaid of DAG |
| `fbeast_plan_validate` | `{ planId }` | cycle detection, missing deps |

### fbeast-critique (wraps CritiqueLoop)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_critique_evaluate` | `{ content, criteria?, evaluators? }` | verdict, findings[], score |
| `fbeast_critique_compare` | `{ original, revised }` | improvement delta |

### fbeast-firewall (wraps MiddlewareChain)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_firewall_scan` | `{ input }` | clean/flagged + matched patterns |
| `fbeast_firewall_scan_file` | `{ path }` | scan file contents |

### fbeast-observer (wraps AuditTrail + CostCalculator)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_observer_log` | `{ event, metadata }` | trace entry id |
| `fbeast_observer_cost` | `{ sessionId? }` | token counts, spend, budget remaining |
| `fbeast_observer_trail` | `{ sessionId }` | full audit trail |

### fbeast-governor (wraps ApprovalGateway)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_governor_check` | `{ action, context }` | approved/denied + reason |
| `fbeast_governor_budget_status` | `{}` | spend vs limits |

### fbeast-skills (wraps SkillManager)

| Tool | Input | Output |
|------|-------|--------|
| `fbeast_skills_list` | `{ enabled? }` | available skills |
| `fbeast_skills_discover` | `{ query? }` | marketplace search |
| `fbeast_skills_info` | `{ skillId }` | full skill descriptor |

---

## Shared SQLite Layer

Single database: `.fbeast/beast.db`, WAL mode.

### Tables

| Table | Owner Server | Cross-read By |
|-------|-------------|---------------|
| `memory` | memory | critique, planner |
| `plans` | planner | observer |
| `audit_trail` | observer | — |
| `cost_ledger` | observer | governor |
| `governor_log` | governor | observer |
| `firewall_log` | firewall | observer |
| `skill_state` | skills | — |

### Concurrency

- WAL mode = multiple readers, single writer (SQLite native)
- `busy_timeout`: 5000ms for write contention
- Each server lazy-connects on first tool call
- No custom locking, no inter-process coordination

---

## CLI: Init & Uninstall

### `fbeast-init`

```
npx @fbeast/mcp-suite init              # all servers + instructions
npx @fbeast/mcp-suite init --pick       # interactive module picker
npx @fbeast/mcp-suite init --hooks      # also add Claude Code hooks
npx @fbeast/mcp-suite init --pick --hooks
```

Steps:
1. Detect Claude Code config location (project `.claude/` preferred, fallback to `~/.claude/`)
2. Create `.fbeast/` dir + SQLite DB with tables
3. Inject MCP server entries into Claude Code config:

```json
{
  "mcpServers": {
    "fbeast-memory": { "command": "fbeast-memory", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-planner": { "command": "fbeast-planner", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-critique": { "command": "fbeast-critique", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-firewall": { "command": "fbeast-firewall", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-observer": { "command": "fbeast-observer", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-governor": { "command": "fbeast-governor", "args": ["--db", ".fbeast/beast.db"] },
    "fbeast-skills": { "command": "fbeast-skills", "args": ["--db", ".fbeast/beast.db"] }
  }
}
```

4. Drop `fbeast-instructions.md` into `.claude/`
5. Print summary of what was added

### `fbeast-uninstall`

```
npx @fbeast/mcp-suite uninstall
```

Steps:
1. Remove all `fbeast-*` entries from Claude Code MCP config
2. Remove `.claude/fbeast-instructions.md`
3. Remove any fbeast hooks from `settings.json`
4. Prompt: "Remove stored data (.fbeast/)? [y/N]"
5. If yes, delete `.fbeast/` directory entirely
6. Print: "fbeast fully removed. No traces left."

Safety: only removes entries matching `fbeast-*` prefix. Never touch user's other config.

---

## Claude Code Instructions File

Dropped at `.claude/fbeast-instructions.md` by init. Guides Claude into structured tool usage:

```markdown
# fbeast Agent Framework

You have access to fbeast MCP tools. Use them as follows:

## On task start
1. Call fbeast_memory_frontload to load project context
2. Call fbeast_firewall_scan on user input before acting
3. Call fbeast_plan_decompose for multi-step tasks

## During execution
- Call fbeast_observer_log for significant actions
- Call fbeast_governor_check before destructive/expensive operations
- Call fbeast_observer_cost periodically to track spend

## Before claiming done
- Call fbeast_critique_evaluate on your output
- If score < 0.7, revise and re-critique
- Call fbeast_observer_trail to finalize audit

## Memory
- fbeast_memory_store for learnings worth preserving
- fbeast_memory_query before making assumptions
```

---

## Optional Hooks

Added by `fbeast-init --hooks`. Real enforcement, not just guidance.

```json
{
  "hooks": {
    "preToolCall": [{
      "command": "fbeast-hook pre-tool $TOOL_NAME",
      "description": "fbeast governance check"
    }],
    "postToolCall": [{
      "command": "fbeast-hook post-tool $TOOL_NAME $RESULT",
      "description": "fbeast observer logging"
    }]
  }
}
```

Hooks opt-in only. More invasive but adds deterministic enforcement MCP tools alone can't guarantee.

---

## Beast Mode Integration

### Config: `.fbeast/config.json`

```json
{
  "mode": "mcp",
  "db": ".fbeast/beast.db",
  "servers": ["memory", "planner", "critique", "firewall", "observer", "governor", "skills"],
  "hooks": false,
  "beast": {
    "enabled": false,
    "provider": "anthropic-api",
    "acknowledged_cli_risk": false
  }
}
```

### Activation

```
fbeast beast --provider=anthropic-api    # compliant, API costs
fbeast beast --provider=claude-cli       # spawns CLI, shows warning
```

### CLI Provider Warning (first time only)

When `--provider=claude-cli` and `acknowledged_cli_risk` is false:

```
WARNING: CLI Provider Mode

This mode spawns Claude CLI as a subprocess, which may violate
Anthropic's Terms of Service and risk account suspension.

Compliant alternatives:
  --provider=anthropic-api  (uses API key, pay per token)
  --provider=gemini-api     (uses Gemini API)
  --provider=openai-api     (uses OpenAI API)

Continue with claude-cli provider? [y/N]
```

If yes: sets `acknowledged_cli_risk: true` in config. No repeat nag.

### Shared State Across Modes

- MCP mode and Beast mode share `.fbeast/beast.db`
- Memory, plans, traces, cost data persist across modes
- User can start with MCP, graduate to Beast. Data carries over.
- Beast mode reads same skill_state, governor_log, etc.

---

## Distribution Strategy

### Marketing Funnel

1. **Discovery** — "supercharge Claude Code with structured reasoning" (MCP angle)
2. **Install** — `npx @fbeast/mcp-suite init` (one command)
3. **Value** — memory, planning, critique improve Claude Code output immediately
4. **Upgrade** — user wants more control → Beast mode with API provider
5. **Power user** — Beast mode with CLI provider (risk acknowledged)

### npm Publishing

- Package: `@fbeast/mcp-suite`
- Contains all servers, CLI tools, instructions
- User installs one package, runs what they need
- No separate packages to manage

### Positioning

- **MCP Mode**: "Agent safety tools for Claude Code" — free, compliant, easy
- **Beast Mode**: "Full autonomous agent orchestrator" — advanced, provider-agnostic, powerful

---

## Capability Boundary

### MCP Mode (tool provider, Claude drives)

- Memory query/store/frontload
- Planning (DAG decomposition)
- Critique (output evaluation)
- Firewall (injection scanning)
- Observer (audit trail + cost tracking)
- Governor (approval gates)
- Skill registry (discover/list)

### Beast Mode Only (orchestrator drives)

- MartinLoop multi-iteration execution
- Provider cascade/failover
- Checkpoint recovery
- Deterministic phase enforcement
- Context compaction
- Git branch isolation

---

## Dependencies

### Existing packages consumed (import, not fork):

- `@frankenbeast/brain` → fbeast-memory (wraps SqliteBrain logic, but points at shared `.fbeast/beast.db` not brain's default DB path)
- `@frankenbeast/planner` → fbeast-planner
- `@frankenbeast/critique` → fbeast-critique
- `@frankenbeast/governor` → fbeast-governor
- `@frankenbeast/observer` → fbeast-observer
- `franken-orchestrator` middleware → fbeast-firewall
- `franken-orchestrator` skill-manager → fbeast-skills

### New dependencies:

- `@modelcontextprotocol/sdk` — MCP server implementation
- `better-sqlite3` — shared SQLite layer (already used by franken-brain)
- `inquirer` or `prompts` — interactive picker for `init --pick`
