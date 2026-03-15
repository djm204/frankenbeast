# franken-skills (MOD-02) Ramp-Up

**Status**: **GHOST** — This module is currently **partially unwired**. The `franken-orchestrator` uses its own internal `LlmSkillHandler` and a synthetic registry for CLI tools, bypassing this canonical registry.

## Module Overview
`franken-skills` is the central authority for agent capabilities. It manages tool discovery, contract validation (input/output schemas), and safety constraints (destructive flags, HITL requirements).

## Current Functionality (Implemented but Unused)
- **Skill Registry**: A synced store of all available agent skills.
- **Discovery Service**: Shells out to `npx @djm204/agent-skills --list` to find global capabilities.
- **Local Loader**: Reads `.json` skill definitions from a local `/skills` directory.
- **Scaffold Generator**: Creates skeleton contracts for missing tools to aid development.

## Integration Gap
The `franken-orchestrator` currently hardcodes its skill logic or uses a simplified synthetic registry. **Phase 8 Focus**: Replace the orchestrator's internal skill handling with this registry to enable pluggable MCP tools and external capabilities.

## Key API
- `createRegistry`: The primary factory for the skill system.
- `ISkillRegistry`: Methods for `sync()`, `getSkill()`, and `hasSkill()`.
- `UnifiedSkillContract`: The canonical schema for a Frankenbeast skill.

## Build & Test
```bash
npm run build         # tsc
npm test              # vitest run (unit)
npm run typecheck     # tsc --noEmit
```

## Dependencies
- `@franken/types`: For shared branded IDs.
- No production dependencies (zero-dependency core).
