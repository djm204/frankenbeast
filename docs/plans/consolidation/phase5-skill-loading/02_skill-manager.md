# Chunk 5.2: SkillManager

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.1 (schemas)
**Estimated size:** Medium (~200 lines + tests)

---

## Purpose

Implement the core `SkillManager` class that handles installing, listing, enabling, disabling, and removing skills from the `skills/` directory.

## Implementation

```typescript
// packages/franken-orchestrator/src/skills/skill-manager.ts

import fs from 'node:fs';
import path from 'node:path';
import type { SkillInfo, McpConfig, SkillCatalogEntry, McpServerConfig, ToolDefinition } from '@frankenbeast/types';
import { McpConfigSchema, SkillToolManifestSchema } from '@frankenbeast/types';

export class SkillManager {
  constructor(
    private skillsDir: string,           // path to skills/ directory
    private enabledSkills: Set<string>,  // from run config
  ) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  /** List all installed skills with metadata */
  listInstalled(): SkillInfo[] {
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => this.readSkillInfo(e.name))
      .filter((info): info is SkillInfo => info !== null);
  }

  /** Install a skill from a provider's marketplace catalog */
  async install(catalogEntry: SkillCatalogEntry): Promise<void> {
    const skillDir = path.join(this.skillsDir, catalogEntry.name);
    fs.mkdirSync(skillDir, { recursive: true });

    const mcpConfig: McpConfig = {
      mcpServers: {
        [catalogEntry.name]: catalogEntry.installConfig,
      },
    };
    fs.writeFileSync(
      path.join(skillDir, 'mcp.json'),
      JSON.stringify(mcpConfig, null, 2),
    );

    if (catalogEntry.toolDefinitions?.length) {
      fs.writeFileSync(
        path.join(skillDir, 'tools.json'),
        JSON.stringify(catalogEntry.toolDefinitions, null, 2),
      );
    }
  }

  /** Install a custom MCP server */
  async installCustom(name: string, serverConfig: McpServerConfig): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    fs.mkdirSync(skillDir, { recursive: true });

    const mcpConfig: McpConfig = {
      mcpServers: { [name]: serverConfig },
    };
    fs.writeFileSync(
      path.join(skillDir, 'mcp.json'),
      JSON.stringify(mcpConfig, null, 2),
    );
  }

  /** Enable a skill (add to active set) */
  enable(name: string): void {
    if (!this.exists(name)) throw new Error(`Skill '${name}' is not installed`);
    this.enabledSkills.add(name);
  }

  /** Disable a skill (remove from active set) */
  disable(name: string): void {
    this.enabledSkills.delete(name);
  }

  /** Remove a skill entirely */
  remove(name: string): void {
    const skillDir = path.join(this.skillsDir, name);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
    }
    this.enabledSkills.delete(name);
  }

  /** Check if a skill is installed */
  exists(name: string): boolean {
    return fs.existsSync(path.join(this.skillsDir, name, 'mcp.json'));
  }

  /** Get the enabled skill names */
  getEnabledSkills(): string[] {
    return [...this.enabledSkills].filter(name => this.exists(name));
  }

  /** Read mcp.json for a skill */
  readMcpConfig(name: string): McpConfig | null {
    const configPath = path.join(this.skillsDir, name, 'mcp.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return McpConfigSchema.parse(raw);
  }

  /** Read context.md for a skill (if it exists) */
  readContext(name: string): string | null {
    const contextPath = path.join(this.skillsDir, name, 'context.md');
    if (!fs.existsSync(contextPath)) return null;
    return fs.readFileSync(contextPath, 'utf-8');
  }

  /** Read tools.json for a skill (if it exists) */
  readTools(name: string): ToolDefinition[] {
    const toolsPath = path.join(this.skillsDir, name, 'tools.json');
    if (!fs.existsSync(toolsPath)) return [];
    const raw = JSON.parse(fs.readFileSync(toolsPath, 'utf-8'));
    return SkillToolManifestSchema.parse(raw);
  }

  /** Write or update context.md for a skill */
  writeContext(name: string, content: string): void {
    if (!this.exists(name)) throw new Error(`Skill '${name}' is not installed`);
    fs.writeFileSync(path.join(this.skillsDir, name, 'context.md'), content);
  }

  /**
   * Load and translate enabled skills for a specific provider.
   * Delegates to ProviderSkillTranslator (Phase 5.3) for per-provider format.
   * Returns combined skill config: tools, system prompt additions, MCP config path.
   */
  async loadForProvider(
    provider: ILlmProvider,
    enabledSkills: string[],
  ): Promise<ProviderSkillConfig> {
    const skills: Array<{
      name: string;
      mcpConfig: McpConfig;
      tools: ToolDefinition[];
      context?: string;
    }> = [];

    for (const name of enabledSkills) {
      const mcpConfig = this.readMcpConfig(name);
      if (!mcpConfig) continue;
      skills.push({
        name,
        mcpConfig,
        tools: this.readTools(name),
        context: this.readContext(name) ?? undefined,
      });
    }

    // Delegate to ProviderSkillTranslator for provider-specific config
    const translator = new ProviderSkillTranslator();
    return translator.translate(provider, skills);
  }

  private readSkillInfo(name: string): SkillInfo | null {
    const mcpConfig = this.readMcpConfig(name);
    if (!mcpConfig) return null;
    const stat = fs.statSync(path.join(this.skillsDir, name));
    return {
      name,
      enabled: this.enabledSkills.has(name),
      hasContext: fs.existsSync(path.join(this.skillsDir, name, 'context.md')),
      mcpServerCount: Object.keys(mcpConfig.mcpServers).length,
      installedAt: stat.birthtime.toISOString(),
    };
  }
}
```

## Tests

```typescript
describe('SkillManager', () => {
  // Use temp directory for each test

  describe('listInstalled()', () => {
    it('returns empty array when no skills', () => { ... });
    it('lists installed skills with metadata', () => { ... });
    it('detects hasContext correctly', () => { ... });
    it('ignores directories without mcp.json', () => { ... });
  });

  describe('install()', () => {
    it('creates skill directory with mcp.json from catalog entry', () => { ... });
    it('mcp.json is valid McpConfig', () => { ... });
    it('writes tools.json when catalog entry includes toolDefinitions', () => { ... });
  });

  describe('installCustom()', () => {
    it('creates skill directory with custom mcp.json', () => { ... });
  });

  describe('enable()/disable()', () => {
    it('enable adds to active set', () => { ... });
    it('disable removes from active set', () => { ... });
    it('enable throws for non-existent skill', () => { ... });
  });

  describe('remove()', () => {
    it('deletes skill directory', () => { ... });
    it('removes from enabled set', () => { ... });
    it('no-op for non-existent skill', () => { ... });
  });

  describe('readContext()/writeContext()', () => {
    it('returns null when no context.md', () => { ... });
    it('reads context.md content', () => { ... });
    it('writes context.md', () => { ... });
  });

  describe('readTools()', () => {
    it('returns empty array when tools.json is missing', () => { ... });
    it('reads and validates normalized tool definitions', () => { ... });
  });

  describe('loadForProvider()', () => {
    it('collects MCP configs and tool manifests from enabled skills', async () => { ... });
    it('assembles context.md content into system prompt', async () => { ... });
    it('delegates to ProviderSkillTranslator for provider-specific format', async () => { ... });
    it('skips skills without mcp.json', async () => { ... });
    it('returns empty config when no skills enabled', async () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/skills/skill-manager.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/skills/skill-manager.test.ts`

## Exit Criteria

- `SkillManager` manages the `skills/` directory
- Install from catalog and custom MCP both work
- Enable/disable/remove/list work correctly
- `readMcpConfig()` validates against schema
- `readTools()` validates optional `tools.json` manifests
- Context.md read/write works
- `loadForProvider()` collects configs + tools + context, delegates to translator, returns `ProviderSkillConfig`
- All tests pass with temp directory isolation
