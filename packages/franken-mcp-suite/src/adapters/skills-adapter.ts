import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface SkillsListEntry {
  name: string;
  enabled: boolean;
  description: string;
  updatedAt?: string;
}

export interface SkillsAdapter {
  list(input: { enabled?: boolean }): Promise<SkillsListEntry[]>;
  info(skillId: string): Promise<Record<string, unknown> | undefined>;
}

interface SkillsAdapterDeps {
  list(input: { enabled?: boolean }): Promise<SkillsListEntry[]>;
  info(skillId: string): Promise<Record<string, unknown> | undefined>;
}

export function createSkillsAdapter(dbPathOrDeps: string | SkillsAdapterDeps): SkillsAdapter {
  if (typeof dbPathOrDeps !== 'string') {
    return dbPathOrDeps;
  }

  const fbeastDir = dirname(dbPathOrDeps);
  const skillsDir = join(fbeastDir, 'skills');
  const configPath = join(fbeastDir, 'config.json');

  return {
    async list(input) {
      const entries = listInstalledSkills(skillsDir, readEnabledSkills(configPath));
      if (input.enabled === undefined) {
        return entries;
      }
      return entries.filter((entry) => entry.enabled === input.enabled);
    },

    async info(skillId) {
      const installed = listInstalledSkills(skillsDir, readEnabledSkills(configPath));
      const summary = installed.find((entry) => entry.name === skillId);

      if (!summary) {
        return undefined;
      }

      const skillDir = join(skillsDir, skillId);
      const contextPath = join(skillDir, 'context.md');
      const toolsPath = join(skillDir, 'tools.json');
      const mcpPath = join(skillDir, 'mcp.json');

      return {
        ...summary,
        hasContext: existsSync(contextPath),
        context: existsSync(contextPath) ? readFileSync(contextPath, 'utf8') : undefined,
        mcpConfig: readJsonFile(mcpPath),
        tools: readJsonFile(toolsPath) ?? [],
      };
    },
  };
}

function listInstalledSkills(skillsDir: string, enabledSkills: Set<string>): SkillsListEntry[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkillSummary(skillsDir, entry.name, enabledSkills))
    .filter((entry): entry is SkillsListEntry => entry !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readSkillSummary(
  skillsDir: string,
  name: string,
  enabledSkills: Set<string>,
): SkillsListEntry | undefined {
  const skillDir = join(skillsDir, name);
  const mcpPath = join(skillDir, 'mcp.json');

  if (!existsSync(mcpPath)) {
    return undefined;
  }

  const stat = statSync(skillDir);
  return {
    name,
    enabled: enabledSkills.has(name),
    description: inferDescription(skillDir, name),
    updatedAt: stat.mtime.toISOString(),
  };
}

function inferDescription(skillDir: string, name: string): string {
  const contextPath = join(skillDir, 'context.md');
  if (existsSync(contextPath)) {
    const firstMeaningfulLine = readFileSync(contextPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (firstMeaningfulLine) {
      return firstMeaningfulLine.replace(/^#+\s*/, '');
    }
  }

  const mcpConfig = readJsonFile(join(skillDir, 'mcp.json')) as
    | { mcpServers?: Record<string, unknown> }
    | undefined;
  const serverNames = mcpConfig?.mcpServers ? Object.keys(mcpConfig.mcpServers) : [];

  return serverNames.length > 0
    ? `Provides MCP server${serverNames.length === 1 ? '' : 's'}: ${serverNames.join(', ')}`
    : `Skill ${name}`;
}

function readEnabledSkills(configPath: string): Set<string> {
  const raw = readJsonFile(configPath) as { skills?: { enabled?: unknown } } | undefined;
  const enabled = raw?.skills?.enabled;

  if (!Array.isArray(enabled)) {
    return new Set();
  }

  return new Set(enabled.filter((value): value is string => typeof value === 'string'));
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
