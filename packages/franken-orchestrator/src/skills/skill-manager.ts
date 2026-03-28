import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  McpConfig,
  SkillInfo,
  SkillCatalogEntry,
  McpServerConfig,
  ToolDefinition,
} from '@franken/types';
import { McpConfigSchema, SkillToolManifestSchema } from '@franken/types';
import type { SkillConfigStore } from './skill-config-store.js';

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

export class SkillManager {
  private readonly enabledSkills: Set<string>;

  constructor(
    private readonly skillsDir: string,
    enabledSkills: Set<string>,
    private readonly configStore?: SkillConfigStore,
  ) {
    mkdirSync(skillsDir, { recursive: true });
    // Merge: constructor-provided set takes precedence, then persisted defaults
    if (configStore && enabledSkills.size === 0) {
      this.enabledSkills = configStore.getEnabledSkills();
    } else {
      this.enabledSkills = enabledSkills;
    }
  }

  /**
   * Validate a skill name to prevent path traversal.
   * Only allows alphanumeric, underscore, and hyphen.
   */
  private validateName(name: string): void {
    if (!SAFE_NAME.test(name)) {
      throw new Error(
        `Invalid skill name '${name}': must match ${SAFE_NAME.source}`,
      );
    }
    // Belt-and-suspenders: verify resolved path is under skillsDir
    const resolved = resolve(this.skillsDir, name);
    if (!resolved.startsWith(resolve(this.skillsDir) + '/') && resolved !== resolve(this.skillsDir)) {
      throw new Error(`Invalid skill name '${name}': path traversal detected`);
    }
  }

  listInstalled(): SkillInfo[] {
    const entries = readdirSync(this.skillsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => this.readSkillInfo(e.name))
      .filter((info): info is SkillInfo => info !== null);
  }

  async install(catalogEntry: SkillCatalogEntry): Promise<void> {
    this.validateName(catalogEntry.name);
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
    this.validateName(name);
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
    this.validateName(name);
    if (!this.exists(name))
      throw new Error(`Skill '${name}' is not installed`);
    this.enabledSkills.add(name);
    this.configStore?.save(this.enabledSkills);
  }

  disable(name: string): void {
    this.enabledSkills.delete(name);
    this.configStore?.save(this.enabledSkills);
  }

  remove(name: string): void {
    this.validateName(name);
    const skillDir = join(this.skillsDir, name);
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true });
    }
    this.enabledSkills.delete(name);
    this.configStore?.save(this.enabledSkills);
  }

  exists(name: string): boolean {
    if (!SAFE_NAME.test(name)) return false;
    return existsSync(join(this.skillsDir, name, 'mcp.json'));
  }

  getEnabledSkills(): string[] {
    return [...this.enabledSkills].filter((name) => this.exists(name));
  }

  readMcpConfig(name: string): McpConfig | null {
    this.validateName(name);
    const configPath = join(this.skillsDir, name, 'mcp.json');
    if (!existsSync(configPath)) return null;
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return McpConfigSchema.parse(raw);
  }

  readContext(name: string): string | null {
    this.validateName(name);
    const contextPath = join(this.skillsDir, name, 'context.md');
    if (!existsSync(contextPath)) return null;
    return readFileSync(contextPath, 'utf-8');
  }

  readTools(name: string): ToolDefinition[] {
    this.validateName(name);
    const toolsPath = join(this.skillsDir, name, 'tools.json');
    if (!existsSync(toolsPath)) return [];
    const raw = JSON.parse(readFileSync(toolsPath, 'utf-8'));
    return SkillToolManifestSchema.parse(raw);
  }

  writeContext(name: string, content: string): void {
    this.validateName(name);
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
