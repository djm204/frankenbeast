# Chunk 5.8: Migrate Existing Beast Definitions

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.2 (SkillManager)
**Estimated size:** Small (migration + documentation)

---

## Purpose

Convert existing beast definitions (`martin-loop-definition`, `chunk-plan-definition`, `design-interview-definition`) into skill directory format so they work with the new `SkillManager`.

## Current State

Beast definitions live in the orchestrator and define:
- `parseArgs()`: CLI argument parsing for the spawned agent
- `configSchema`: Zod schema for the config
- `description`: Human-readable description
- `usage`: Usage instructions

These are internal to the orchestrator — they're how the orchestrator knows how to spawn different agent types.

## Migration Plan

Each definition becomes a skill directory:

```
skills/
├── martin-loop/
│   ├── mcp.json          # spawned agent config
│   └── context.md         # usage instructions from definition
├── chunk-plan/
│   ├── mcp.json
│   └── context.md
├── design-interview/
│   ├── mcp.json
│   └── context.md
```

### What goes in mcp.json

For internal beast definitions, `mcp.json` wraps the CLI entry point:

```json
{
  "mcpServers": {
    "martin-loop": {
      "command": "node",
      "args": ["packages/franken-orchestrator/dist/cli/entry.js", "--beast", "martin-loop"],
      "env": {}
    }
  }
}
```

### What goes in context.md

The definition's `description` + `usage` text becomes `context.md`:

```markdown
# Martin Loop

Autonomous planning loop that decomposes features into chunks and executes them.

## Usage
- Requires --plan-dir argument
- Works with any provider via ProviderRegistry
```

### What stays in the orchestrator

The `parseArgs()` and `configSchema` logic stays — it's part of the orchestrator's process supervisor, not the skill system. The skill system only handles MCP config and context injection.

## What to Do

1. For each existing beast definition:
   - Create `skills/<name>/mcp.json` with the spawn config
   - Create `skills/<name>/context.md` from the definition's description/usage
2. Update the orchestrator to look for beast definitions in `skills/` in addition to the built-in registry
3. Ensure existing `parseArgs()` + `configSchema` still work for the orchestrator's spawn logic

## Files

- **Add:** `skills/martin-loop/mcp.json` + `context.md`
- **Add:** `skills/chunk-plan/mcp.json` + `context.md`
- **Add:** `skills/design-interview/mcp.json` + `context.md`
- **Possibly modify:** Beast definition lookup logic in orchestrator

## Exit Criteria

- All existing beast definitions have corresponding skill directories
- `SkillManager.listInstalled()` includes the migrated definitions
- Existing spawn logic still works (parseArgs, configSchema unchanged)
- Context.md contains useful agent instructions
