# Chunk 5.3: Per-Provider MCP Config Translation

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.1 (schemas)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

Translate provider-neutral skill definitions to each provider's execution format at spawn time. CLI providers receive translated MCP config artifacts; API providers receive normalized `ToolDefinition[]` plus any `context.md` additions.

## Implementation

```typescript
// packages/franken-orchestrator/src/skills/provider-skill-translator.ts

import type {
  McpConfig,
  ILlmProvider,
  ProviderSkillConfig,
  ToolDefinition,
} from '@frankenbeast/types';

export class ProviderSkillTranslator {
  /**
   * Translate enabled skills to provider-specific config.
   */
  translate(
    provider: ILlmProvider,
    skills: Array<{ name: string; mcpConfig: McpConfig; tools: ToolDefinition[]; context?: string }>,
  ): ProviderSkillConfig {
    switch (provider.type) {
      case 'claude-cli': return this.translateForClaude(skills);
      case 'codex-cli': return this.translateForCodex(skills);
      case 'gemini-cli': return this.translateForGemini(skills);
      default: return this.translateForApi(skills);
    }
  }

  /**
   * Claude CLI: merge all mcp.json into one temp file, pass via --mcp-config.
   * Context appended via --append-system-prompt.
   */
  private translateForClaude(skills: ...): ProviderSkillConfig {
    // Merge all mcpServers from all skills into one object
    const merged: Record<string, McpServerConfig> = {};
    for (const skill of skills) {
      Object.assign(merged, skill.mcpConfig.mcpServers);
    }

    const mergedConfig = JSON.stringify({ mcpServers: merged }, null, 2);
    const tempPath = path.join(os.tmpdir(), `frankenbeast-mcp-${Date.now()}.json`);

    return {
      mcpConfigPath: tempPath,
      cliArgs: ['--mcp-config', tempPath],
      filesToWrite: [{ path: tempPath, content: mergedConfig }],
      systemPromptAddition: skills
        .filter(s => s.context)
        .map(s => `## Skill: ${s.name}\n${s.context}`)
        .join('\n\n'),
      tools: [],
    };
  }

  /**
   * Codex CLI: write to codex config or use codex mcp add per server.
   * Context via -c override.
   */
  private translateForCodex(skills: ...): ProviderSkillConfig {
    // For each MCP server: generate codex mcp add commands or config entries
    // Return provider-specific launch artifacts in cliArgs/filesToWrite
    // ...
  }

  /**
   * Gemini CLI: write to settings.json.
   * Context via GEMINI.md.
   */
  private translateForGemini(skills: ...): ProviderSkillConfig {
    // Write MCP servers to ~/.gemini/settings.json format
    // Context goes into GEMINI.md managed section
    // ...
  }

  /**
   * API adapters: use normalized tool manifests captured at install/discovery time.
   * Context goes into system message.
   */
  private translateForApi(skills: ...): ProviderSkillConfig {
    // API adapters do not speak MCP directly. They receive normalized
    // ToolDefinition[] captured at install/discovery time via tools.json.
    const tools = skills.flatMap(skill => skill.tools);
    return {
      tools,
      systemPromptAddition: skills
        .filter(s => s.context)
        .map(s => `## Skill: ${s.name}\n${s.context}`)
        .join('\n\n'),
      cliArgs: [],
      filesToWrite: [],
    };
  }
}
```

If an enabled skill has no `tools.json`, API adapters omit it from `tools` rather than guessing tool schemas from `mcp.json`. CLI adapters still work because they use MCP directly.

## Tests

```typescript
describe('ProviderSkillTranslator', () => {
  const sampleSkill = {
    name: 'github',
    mcpConfig: {
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    },
    context: 'Always create PRs with conventional commit titles',
  };

  describe('translateForClaude()', () => {
    it('merges all MCP configs into single temp file', () => { ... });
    it('returns --mcp-config arg pointing to temp file', () => { ... });
    it('merges multiple skills without collisions', () => { ... });
    it('includes context in systemPromptAddition', () => { ... });
    it('skips context for skills without context.md', () => { ... });
  });

  describe('translateForCodex()', () => {
    it('generates codex-compatible config entries', () => { ... });
    it('includes --env for env vars', () => { ... });
  });

  describe('translateForGemini()', () => {
    it('generates settings.json format', () => { ... });
    it('includes GEMINI.md content for context', () => { ... });
  });

  describe('translateForApi()', () => {
    it('returns flattened ToolDefinition[] for enabled skills', () => { ... });
    it('omits skills without tools.json manifests', () => { ... });
    it('returns no MCP launch artifacts', () => { ... });
    it('includes context in systemPromptAddition', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/skills/provider-skill-translator.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/skills/provider-skill-translator.test.ts`

## Exit Criteria

- Claude: merged `mcp.json` temp file + `--mcp-config` arg
- Codex: config entries or `codex mcp add` commands
- Gemini: `settings.json` format + `GEMINI.md` content
- API: normalized `ToolDefinition[]` plus context (no MCP CLI args)
- Context.md content included in `systemPromptAddition`
- Tests cover all 4 provider types
