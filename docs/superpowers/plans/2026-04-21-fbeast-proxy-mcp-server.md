# fbeast Proxy MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an on-demand MCP proxy server (`fbeast-proxy`) that exposes only two meta-tools — `search_tools` and `execute_tool` — instead of 20+ full tool schemas upfront. Full schemas stay server-side and are never serialised to the client, reducing initial context window cost by ~90%.

**Pattern:** Two-phase tool interaction.
- Phase 1: agent calls `search_tools(query?)` → gets a lightweight index (~150 tokens total): name + 8-word stub description per tool.
- Phase 2: agent calls `execute_tool(tool, args)` → proxy looks up the full handler internally, validates args, calls it, returns result.

**Architecture:** Additive — the 7 individual servers stay intact. `fbeast-proxy` is a new optional binary. `fbeast init --mode=proxy` registers `fbeast-proxy` instead of 7 individual servers. Default `fbeast init` behaviour is unchanged.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, `vitest`, existing fbeast adapters.

---

## Key Files

### New files to create

- `packages/franken-mcp-suite/src/shared/tool-registry.ts`
  Full tool registry: stub entries (name + short description) + full entries (inputSchema + handler factory). This is the single source of truth for all fbeast tools. Individual server files import from here instead of defining tools inline.

- `packages/franken-mcp-suite/src/servers/proxy.ts`
  Proxy MCP server. Exposes exactly 2 tools: `search_tools` and `execute_tool`. On `execute_tool`, instantiates the required adapter(s) from `dbPath`, looks up the handler in the registry, runs it.

- `packages/franken-mcp-suite/src/servers/proxy.test.ts`
  Unit tests for the proxy: search filtering, execute routing, unknown tool errors, arg passthrough.

- `packages/franken-mcp-suite/src/shared/tool-registry.test.ts`
  Verifies every registered tool has a stub description ≤ 15 words and a valid inputSchema.

### Existing files to modify

- `packages/franken-mcp-suite/package.json`
  Add `fbeast-proxy` bin entry pointing to `dist/servers/proxy.js`.

- `packages/franken-mcp-suite/src/cli/init.ts`
  Add `--mode=proxy` flag. When set, register `fbeast-proxy --db <path>` instead of 7 individual servers. Claude/Gemini: add single `fbeast-proxy` entry to `mcpServers`. Codex: `codex mcp add fbeast-proxy`.

- `packages/franken-mcp-suite/src/cli/init-options.ts`
  Parse `--mode=standard|proxy` from argv, default `standard`. Export `mode` in `ResolvedInitOptions`.

- `packages/franken-mcp-suite/src/cli/uninstall.ts`
  On uninstall, also remove `fbeast-proxy` entry if present (check both the 7 individual names and `fbeast-proxy`).

- `packages/franken-mcp-suite/src/cli/main.ts`
  Pass `mode` from `resolveInitOptions` through to `runInit`.

- `docs/walkthrough-mcp-suite.md`
  Document proxy mode: what it is, when to use it, how to install.

---

## Implementation Tasks

### Task 1 — Tool registry (`src/shared/tool-registry.ts`)

Build the registry that replaces inline tool definitions in each server file.

**Stub entry shape:**
```typescript
interface ToolStub {
  name: string;
  server: 'memory' | 'planner' | 'critique' | 'firewall' | 'observer' | 'governor' | 'skills';
  description: string; // ≤ 15 words, "Verb + Resource + key scope" pattern
}
```

**Full entry shape:**
```typescript
interface ToolFull extends ToolStub {
  inputSchema: Record<string, unknown>;
  makeHandler: (adapters: AdapterSet) => (args: Record<string, unknown>) => Promise<ToolResult>;
}
```

**`AdapterSet`** is created once per `execute_tool` call from `dbPath`:
```typescript
interface AdapterSet {
  brain: BrainAdapter;
  observer: ObserverAdapter;
  governor: GovernorAdapter;
  planner: PlannerAdapter;
  critique: CritiqueAdapter;
  firewall: FirewallAdapter;
  skills: SkillsAdapter;
}
```

**Stub descriptions to use** (exactly this wording — established pattern):

| Tool | Stub description |
|------|-----------------|
| `fbeast_memory_store` | Store key/value in working or episodic memory |
| `fbeast_memory_query` | Search memory entries by keyword substring |
| `fbeast_memory_frontload` | Load all memory entries for project context |
| `fbeast_memory_forget` | Delete working memory entry by key |
| `fbeast_plan_decompose` | Break task into DAG of dependent steps |
| `fbeast_plan_status` | Get status of all steps in current plan |
| `fbeast_plan_validate` | Validate plan DAG for cycles and missing deps |
| `fbeast_critique_evaluate` | Score output quality 0–1, suggest improvements |
| `fbeast_critique_compare` | Compare two outputs, return better one with rationale |
| `fbeast_firewall_scan` | Detect prompt injection in text input |
| `fbeast_firewall_scan_file` | Detect prompt injection in file contents |
| `fbeast_observer_log` | Append event to session audit trail |
| `fbeast_observer_log_cost` | Record LLM token usage and cost for a call |
| `fbeast_observer_cost` | Get token/cost summary by model for session |
| `fbeast_observer_trail` | Retrieve full ordered audit trail for session |
| `fbeast_governor_check` | Check if action is safe to proceed |
| `fbeast_governor_budget` | Get current spend vs budget status |
| `fbeast_skills_list` | List available skills by category |
| `fbeast_skills_load` | Load full skill content by name |
| `fbeast_skills_discover` | Search skills by keyword or capability |

Full `inputSchema` entries come from the existing server files verbatim — copy them into the registry, do not change schemas.

**Exports:**
```typescript
export const TOOL_STUBS: ToolStub[];
export const TOOL_REGISTRY: Map<string, ToolFull>;
export function searchTools(query?: string): ToolStub[];
```

`searchTools` filters by substring match on name + description. No query = return all stubs.

- [ ] Create `src/shared/tool-registry.ts` with all stubs and full entries
- [ ] Create `src/shared/tool-registry.test.ts` asserting: all tools have stubs ≤ 15 words, all tools in TOOL_REGISTRY have inputSchema and makeHandler, searchTools('memory') returns only memory tools, searchTools() returns all 20

---

### Task 2 — Proxy server (`src/servers/proxy.ts`)

Single MCP server exposing exactly 2 tools.

**`search_tools` tool:**
```typescript
{
  name: 'search_tools',
  description: 'List available fbeast tools. Pass a query to filter by name or capability.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional keyword filter' },
    },
  },
  handler: async (args) => {
    const results = searchTools(args.query ? String(args.query) : undefined);
    const lines = results.map(t => `${t.name.padEnd(32)} ${t.description}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
}
```

**`execute_tool` tool:**
```typescript
{
  name: 'execute_tool',
  description: 'Execute any fbeast tool by name with args object.',
  inputSchema: {
    type: 'object',
    properties: {
      tool: { type: 'string', description: 'Tool name from search_tools' },
      args: { type: 'object', description: 'Tool arguments as JSON object' },
    },
    required: ['tool', 'args'],
  },
  handler: async (args) => {
    const toolName = String(args.tool);
    const toolArgs = (args.args ?? {}) as Record<string, unknown>;
    const entry = TOOL_REGISTRY.get(toolName);
    if (!entry) {
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}. Call search_tools to list available tools.` }], isError: true };
    }
    const adapters = createAdapterSet(dbPath);
    const handler = entry.makeHandler(adapters);
    return handler(toolArgs);
  },
}
```

`dbPath` is parsed from `--db` CLI arg, same as individual servers.

The proxy creates adapters lazily per `execute_tool` call (or caches them — implementer's choice, caching is fine since dbPath is fixed).

- [ ] Create `src/servers/proxy.ts` with `createProxyServer(deps: { dbPath: string })` export
- [ ] Add `isMain(import.meta.url)` block parsing `--db` and calling `server.start()`
- [ ] Create `src/servers/proxy.test.ts`:
  - `search_tools` with no query returns all tools
  - `search_tools` with query filters correctly
  - `execute_tool` with known tool calls through to handler
  - `execute_tool` with unknown tool returns isError response
  - `execute_tool` passes args to handler correctly

---

### Task 3 — `package.json` bin entry

- [ ] Add to `packages/franken-mcp-suite/package.json`:
  ```json
  "fbeast-proxy": "./dist/servers/proxy.js"
  ```
  alongside existing bin entries.

---

### Task 4 — `--mode` flag in init

**`src/cli/init-options.ts`:**
- [ ] Parse `--mode=standard|proxy` from argv
- [ ] Add `mode: 'standard' | 'proxy'` to `ResolvedInitOptions`, default `'standard'`
- [ ] Add `--mode` to the KNOWN_INIT_FLAGS list in `main.ts`

**`src/cli/init.ts`:**
- [ ] Accept `mode` in `InitOptions`
- [ ] In `initJsonClient`: when `mode === 'proxy'`, write a single `fbeast-proxy` entry to `mcpServers` instead of 7 individual entries:
  ```json
  "fbeast-proxy": { "command": "fbeast-proxy", "args": ["--db", "<dbPath>"] }
  ```
- [ ] In `initCodex`: when `mode === 'proxy'`, run `codex mcp add fbeast-proxy -- fbeast-proxy --db <dbPath>` once instead of 7 `mcp add` calls
- [ ] Console output should reflect mode: `Servers: fbeast-proxy (proxy mode)` vs individual server list

**`src/cli/uninstall.ts`:**
- [ ] In `uninstallJsonClient`: also delete `fbeast-proxy` key from `mcpServers` if present
- [ ] In `uninstallCodex`: also run `codex mcp remove fbeast-proxy`

**Tests:**
- [ ] `init.test.ts`: `--mode=proxy` writes single `fbeast-proxy` entry, not 7
- [ ] `init.test.ts`: `--mode=standard` (default) writes 7 entries as before
- [ ] `init.test.ts`: codex `--mode=proxy` calls spawn once not 7 times
- [ ] `uninstall.test.ts`: removes `fbeast-proxy` from settings

---

### Task 5 — Docs

- [ ] Update `docs/walkthrough-mcp-suite.md`:
  - Add "Proxy Mode" section after standard install
  - Explain: single registration, 2 tools, ~90% token reduction
  - Show `fbeast init --mode=proxy` command
  - Show what the agent sees: `search_tools` + `execute_tool` only
  - Note: proxy mode is recommended for large projects or agents with tight context budgets
- [ ] Update `packages/franken-mcp-suite/README.md`: add proxy mode to install section

---

## Invariants

- Individual servers (`fbeast-memory`, `fbeast-governor`, etc.) are NOT changed. They remain as-is.
- `TOOL_REGISTRY` is the single source of truth for tool schemas — no schema duplication between individual servers and the registry. (Individual servers can keep their own inline definitions for now; migration to registry is out of scope.)
- `execute_tool` never leaks the full schema into the MCP response — the schema is only used internally for routing.
- Proxy mode is opt-in. Default `fbeast init` behaviour is unchanged.
- All new code has tests. `npx vitest run` passes before marking any task done.
