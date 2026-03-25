import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  McpConfig,
  SkillInfo,
  SkillCatalogEntry,
  McpServerConfig,
  ToolDefinition,
} from '@franken/types';
import { McpConfigSchema, SkillToolManifestSchema } from '@franken/types';

export class SkillManager {
  private readonly enabledSkills: Set<string>;

  constructor(
    private readonly skillsDir: string,
    enabledSkills: Set<string>,
  ) {
    mkdirSync(skillsDir, { recursive: true });
    this.enabledSkills = enabledSkills;
  }

  listInstalled(): SkillInfo[] {
    const entries = readdirSync(this.skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => this.readSkillInfo(e.name))
      .filter((info): info is SkillInfo => info !== null);
  }

  async install(catalogEntry: SkillCatalogEntry): Promise<void> {
    const skillDir = join(this.skillsDir, catalogEntry.name);
    mkdirSync(skillDir, { recursive: true });

    const mcpConfig: McpConfig = {
      mcpServers: {
        [catalogEntry.name]: catalogEntry.installConfig,
      },
    };
    writeFileSync(
      join(skillDir, 'mcp.json'),
      JSON.stringify(mcpConfig, null, 2),
    );

    if (catalogEntry.toolDefinitions?.length) {
      writeFileSync(
        join(skillDir, 'tools.json'),
        JSON.stringify(catalogEntry.toolDefinitions, null, 2),
      );
    }
  }

  async installCustom(name: string, serverConfig: McpServerConfig): Promise<void> {
    const skillDir = join(this.skillsDir, name);
    mkdirSync(skillDir, { recursive: true });

    const mcpConfig: McpConfig = {
      mcpServers: { [name]: serverConfig },
    };
    writeFileSync(
      join(skillDir, 'mcp.json'),
      JSON.stringify(mcpConfig, null, 2),
    );
  }

  enable(name: string): void {
    if (!this.exists(name))
      throw new Error(`Skill '${name}' is not installed`);
    this.enabledSkills.add(name);
  }

  disable(name: string): void {
    this.enabledSkills.delete(name);
  }

  remove(name: string): void {
    const skillDir = join(this.skillsDir, name);
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true });
    }
    this.enabledSkills.delete(name);
  }

  exists(name: string): boolean {
    return existsSync(join(this.skillsDir, name, 'mcp.json'));
  }

  getEnabledSkills(): string[] {
    return [...this.enabledSkills].filter((name) => this.exists(name));
  }

  readMcpConfig(name: string): McpConfig | null {
    const configPath = join(this.skillsDir, name, 'mcp.json');
    if (!existsSync(configPath)) return null;
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return McpConfigSchema.parse(raw);
  }

  readContext(name: string): string | null {
    const contextPath = join(this.skillsDir, name, 'context.md');
    if (!existsSync(contextPath)) return null;
    return readFileSync(contextPath, 'utf-8');
  }

  readTools(name: string): ToolDefinition[] {
    const toolsPath = join(this.skillsDir, name, 'tools.json');
    if (!existsSync(toolsPath)) return [];
    const raw = JSON.parse(readFileSync(toolsPath, 'utf-8'));
    return SkillToolManifestSchema.parse(raw);
  }

  writeContext(name: string, content: string): void {
    if (!this.exists(name))
      throw new Error(`Skill '${name}' is not installed`);
    writeFileSync(join(this.skillsDir, name, 'context.md'), content);
  }

  private readSkillInfo(name: string): SkillInfo | null {
    const mcpConfig = this.readMcpConfig(name);
    if (!mcpConfig) return null;
    const stat = statSync(join(this.skillsDir, name));
    return {
      name,
      enabled: this.enabledSkills.has(name),
      hasContext: existsSync(join(this.skillsDir, name, 'context.md')),
      mcpServerCount: Object.keys(mcpConfig.mcpServers).length,
      installedAt: stat.birthtime.toISOString(),
    };
  }
}
