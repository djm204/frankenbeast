import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  McpConfig,
  SkillInfo,
  SkillCatalogEntry,
  McpServerConfig,
  ToolDefinition,
  ILlmProvider,
  ProviderSkillConfig,
} from '@franken/types';
import { McpConfigSchema, SkillToolManifestSchema } from '@franken/types';
import type { SkillConfigStore } from './skill-config-store.js';
import { ProviderSkillTranslator } from './provider-skill-translator.js';

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

function isContainedPath(candidate: string, root: string): boolean {
  const relation = relative(root, candidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function unsafePathError(path: string, reason: string): Error {
  return new Error(`Unsafe skill path '${path}': ${reason}`);
}

function assertContainedPath(candidate: string, root: string, label: string): void {
  if (!isContainedPath(candidate, root)) {
    throw unsafePathError(candidate, `${label} escapes ${root}`);
  }
}

function assertNoSymlink(path: string, label: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw unsafePathError(path, `${label} must not be a symlink`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

function writeFileAtomicNoFollow(path: string, content: string): void {
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    writeFileSync(fd, content);
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, path);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tempPath, { force: true });
    throw err;
  }
}

function requireSecurityReviewByDefault(
  tools: ToolDefinition[],
): ToolDefinition[] {
  return tools.map((tool) => ({
    ...tool,
    requiresHitl: tool.requiresHitl ?? true,
  }));
}

export class SkillManager {
  private readonly enabledSkills: Set<string>;
  private readonly skillsDirRoot: string;
  private readonly skillsDirReal: string;

  constructor(
    skillsDir: string,
    enabledSkills: Set<string>,
    private readonly configStore?: SkillConfigStore,
  ) {
    this.skillsDirRoot = resolve(skillsDir);
    mkdirSync(this.skillsDirRoot, { recursive: true });
    assertNoSymlink(this.skillsDirRoot, 'skills root');
    this.skillsDirReal = realpathSync(this.skillsDirRoot);
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
  }

  private skillDirectoryPath(name: string): string {
    this.validateName(name);
    const skillDir = resolve(this.skillsDirRoot, name);
    assertContainedPath(skillDir, this.skillsDirRoot, 'skill directory');
    return skillDir;
  }

  private validateExistingSkillDirectory(skillDir: string): void {
    if (!existsSync(skillDir)) return;
    assertNoSymlink(skillDir, 'skill directory');
    if (!lstatSync(skillDir).isDirectory()) {
      throw unsafePathError(skillDir, 'skill path is not a directory');
    }
    assertContainedPath(realpathSync(skillDir), this.skillsDirReal, 'skill directory');
  }

  private resolveSkillFilePath(name: string, fileName: 'mcp.json' | 'tools.json' | 'context.md'): string {
    const skillDir = this.skillDirectoryPath(name);
    this.validateExistingSkillDirectory(skillDir);
    const filePath = resolve(skillDir, fileName);
    assertContainedPath(filePath, skillDir, 'skill file');
    return filePath;
  }

  private ensureSkillDirectory(name: string): string {
    const skillDir = this.skillDirectoryPath(name);
    if (existsSync(skillDir)) {
      assertNoSymlink(skillDir, 'skill directory');
      if (!lstatSync(skillDir).isDirectory()) {
        throw unsafePathError(skillDir, 'skill path is not a directory');
      }
    } else {
      mkdirSync(skillDir, { recursive: true });
    }

    const realSkillDir = realpathSync(skillDir);
    assertContainedPath(realSkillDir, this.skillsDirReal, 'skill directory');
    return skillDir;
  }

  private skillFilePath(name: string, fileName: 'mcp.json' | 'tools.json' | 'context.md'): string {
    const skillDir = this.ensureSkillDirectory(name);
    const filePath = resolve(skillDir, fileName);
    assertContainedPath(filePath, skillDir, 'skill file');
    return filePath;
  }

  private writeSkillFile(name: string, fileName: 'mcp.json' | 'tools.json' | 'context.md', content: string): void {
    const filePath = this.validateSkillFileTarget(name, fileName);
    writeFileAtomicNoFollow(filePath, content);
    const realFilePath = realpathSync(filePath);
    assertContainedPath(realFilePath, this.skillsDirReal, 'skill file');
  }

  private validateSkillFileTarget(name: string, fileName: 'mcp.json' | 'tools.json' | 'context.md'): string {
    const filePath = this.skillFilePath(name, fileName);
    assertNoSymlink(filePath, 'skill file');
    if (existsSync(filePath) && !lstatSync(filePath).isFile()) {
      throw unsafePathError(filePath, 'skill file target is not a regular file');
    }
    return filePath;
  }

  private removeSkillFile(name: string, fileName: 'tools.json'): void {
    const filePath = this.validateSkillFileTarget(name, fileName);
    if (!existsSync(filePath)) return;
    rmSync(filePath);
  }

  listInstalled(): SkillInfo[] {
    const entries = readdirSync(this.skillsDirRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => this.readSkillInfo(e.name))
      .filter((info): info is SkillInfo => info !== null);
  }

  async install(catalogEntry: SkillCatalogEntry): Promise<void> {
    this.validateName(catalogEntry.name);
    const mcpConfig = McpConfigSchema.parse({
      mcpServers: {
        [catalogEntry.name]: catalogEntry.installConfig,
      },
    });
    const tools = catalogEntry.toolDefinitions?.length
      ? requireSecurityReviewByDefault(
        SkillToolManifestSchema.parse(catalogEntry.toolDefinitions),
      )
      : undefined;
    this.validateSkillFileTarget(catalogEntry.name, 'mcp.json');
    const toolsPath = this.validateSkillFileTarget(catalogEntry.name, 'tools.json');
    if (!tools && existsSync(toolsPath)) {
      this.removeSkillFile(catalogEntry.name, 'tools.json');
    }

    this.writeSkillFile(
      catalogEntry.name,
      'mcp.json',
      JSON.stringify(mcpConfig, null, 2),
    );

    if (tools) {
      this.writeSkillFile(
        catalogEntry.name,
        'tools.json',
        JSON.stringify(tools, null, 2),
      );
    }
  }

  async installCustom(name: string, serverConfig: McpServerConfig): Promise<void> {
    this.validateName(name);
    const mcpConfig = McpConfigSchema.parse({
      mcpServers: { [name]: serverConfig },
    });
    this.validateSkillFileTarget(name, 'mcp.json');
    const toolsPath = this.validateSkillFileTarget(name, 'tools.json');
    if (existsSync(toolsPath)) {
      this.removeSkillFile(name, 'tools.json');
    }
    this.writeSkillFile(
      name,
      'mcp.json',
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
    const skillDir = this.skillDirectoryPath(name);
    if (existsSync(skillDir)) {
      if (lstatSync(skillDir).isSymbolicLink()) {
        rmSync(skillDir);
        this.enabledSkills.delete(name);
        this.configStore?.save(this.enabledSkills);
        return;
      }
      rmSync(skillDir, { recursive: true });
    }
    this.enabledSkills.delete(name);
    this.configStore?.save(this.enabledSkills);
  }

  exists(name: string): boolean {
    if (!SAFE_NAME.test(name)) return false;
    try {
      const skillDir = this.skillDirectoryPath(name);
      if (existsSync(skillDir)) {
        assertNoSymlink(skillDir, 'skill directory');
      }
      const mcpPath = resolve(skillDir, 'mcp.json');
      assertContainedPath(mcpPath, skillDir, 'skill file');
      if (existsSync(mcpPath)) {
        assertNoSymlink(mcpPath, 'skill file');
      }
      return existsSync(mcpPath);
    } catch {
      return false;
    }
  }

  getEnabledSkills(): string[] {
    return [...this.enabledSkills].filter((name) => this.exists(name));
  }

  readMcpConfig(name: string): McpConfig | null {
    const configPath = this.resolveSkillFilePath(name, 'mcp.json');
    if (!existsSync(configPath)) return null;
    assertNoSymlink(configPath, 'skill file');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return McpConfigSchema.parse(raw);
  }

  readContext(name: string): string | null {
    const contextPath = this.resolveSkillFilePath(name, 'context.md');
    if (!existsSync(contextPath)) return null;
    assertNoSymlink(contextPath, 'skill file');
    return readFileSync(contextPath, 'utf-8');
  }

  readTools(name: string): ToolDefinition[] {
    const toolsPath = this.resolveSkillFilePath(name, 'tools.json');
    if (!existsSync(toolsPath)) return [];
    assertNoSymlink(toolsPath, 'skill file');
    const raw = JSON.parse(readFileSync(toolsPath, 'utf-8'));
    return requireSecurityReviewByDefault(SkillToolManifestSchema.parse(raw));
  }

  writeContext(name: string, content: string): void {
    this.validateName(name);
    if (!this.exists(name))
      throw new Error(`Skill '${name}' is not installed`);
    this.writeSkillFile(name, 'context.md', content);
  }

  loadForProvider(provider: ILlmProvider): ProviderSkillConfig {
    const translator = new ProviderSkillTranslator();
    const enabledNames = this.getEnabledSkills();
    const inputs = enabledNames.map((name) => {
      const context = this.readContext(name);
      return {
        name,
        mcpConfig: this.readMcpConfig(name) ?? { mcpServers: {} },
        tools: this.readTools(name),
        ...(context !== null ? { context } : {}),
      };
    });
    return translator.translate(provider, inputs);
  }

  private readSkillInfo(name: string): SkillInfo | null {
    const mcpConfig = this.readMcpConfig(name);
    if (!mcpConfig) return null;
    const skillDir = this.skillDirectoryPath(name);
    this.validateExistingSkillDirectory(skillDir);
    const stat = statSync(skillDir);
    return {
      name,
      enabled: this.enabledSkills.has(name),
      hasContext: existsSync(this.resolveSkillFilePath(name, 'context.md')),
      mcpServerCount: Object.keys(mcpConfig.mcpServers).length,
      installedAt: stat.birthtime.toISOString(),
    };
  }
}
