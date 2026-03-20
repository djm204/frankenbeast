# Chunk 5.1: Skill Directory Structure + Schemas

**Phase:** 5 — Skill Loading
**Depends on:** Phase 1
**Estimated size:** Small (~80 lines types + tests)

---

## Purpose

Define the Zod schemas for skill configuration in `franken-types`. These schemas validate `mcp.json` files, optional `tools.json` manifests for API-backed providers, skill metadata, and the run config `skills` array.

## Types

```typescript
// packages/franken-types/src/skill.ts

import { z } from 'zod';
import { ToolDefinitionSchema } from './provider.js';

/**
 * mcp.json format — collection of MCP servers.
 * The inner object matches McpServerConfig from @frankenbeast/types/provider.ts
 * (Phase 3.1). McpConfig is the file format; McpServerConfig is a single server.
 */
export const McpConfigSchema = z.object({
  mcpServers: z.record(z.object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
  })),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

/** Installed skill metadata */
export const SkillInfoSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  hasContext: z.boolean(),           // has context.md
  provider: z.string().optional(),   // which provider it came from
  mcpServerCount: z.number().int().nonneg(),
  installedAt: z.string().datetime(),
});
export type SkillInfo = z.infer<typeof SkillInfoSchema>;

/** Optional API-provider tool manifest */
export const SkillToolManifestSchema = z.array(ToolDefinitionSchema);
export type SkillToolManifest = z.infer<typeof SkillToolManifestSchema>;

/** Run config skills array */
export const SkillsConfigSchema = z.array(z.string().min(1));
```

## Directory Structure

```
skills/                              # root skills directory
├── github/
│   └── mcp.json                    # required
├── code-review/
│   ├── mcp.json                    # required
│   ├── tools.json                  # optional normalized tool schemas for API adapters
│   └── context.md                  # optional
```

- Each subdirectory of `skills/` is one skill
- Directory name = skill name
- `mcp.json` is required — follows standard MCP config format
- `tools.json` is optional — normalized `ToolDefinition[]` captured from marketplace metadata for API adapters
- `context.md` is optional — free-form text appended to system prompt

## Files

- **Add:** `packages/franken-types/src/skill.ts`
- **Modify:** `packages/franken-types/src/index.ts` — re-export
- **Add:** `packages/franken-types/tests/skill.test.ts`

## Exit Criteria

- `McpConfigSchema` validates `mcp.json` files
- `SkillToolManifestSchema` validates optional `tools.json` files
- `SkillInfoSchema` validates skill metadata
- `SkillsConfigSchema` validates the run config `skills` array
- Tests cover valid and invalid configs
