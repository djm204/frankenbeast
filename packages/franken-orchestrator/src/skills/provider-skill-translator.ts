import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  McpConfig,
  ILlmProvider,
  ProviderSkillConfig,
  ToolDefinition,
} from '@franken/types';

export interface TranslatorSkillInput {
  name: string;
  mcpConfig: McpConfig;
  tools: ToolDefinition[];
  context?: string;
}

export class ProviderSkillTranslator {
  translate(
    provider: ILlmProvider,
    skills: TranslatorSkillInput[],
  ): ProviderSkillConfig {
    switch (provider.type) {
      case 'claude-cli':
        return this.translateForClaude(skills);
      case 'codex-cli':
        return this.translateForCodex(skills);
      case 'gemini-cli':
        return this.translateForGemini(skills);
      default:
        return this.translateForApi(skills);
    }
  }

  private buildContextAddition(skills: TranslatorSkillInput[]): string {
    return skills
      .filter((s) => s.context)
      .map((s) => `## Skill: ${s.name}\n${s.context}`)
      .join('\n\n');
  }

  private mergeAllServers(
    skills: TranslatorSkillInput[],
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const skill of skills) {
      for (const [name, config] of Object.entries(
        skill.mcpConfig.mcpServers,
      )) {
        merged[name] = config;
      }
    }
    return merged;
  }

  private translateForClaude(
    skills: TranslatorSkillInput[],
  ): ProviderSkillConfig {
    if (skills.length === 0) {
      return { systemPromptAddition: '', tools: [] };
    }

    const merged = this.mergeAllServers(skills);
    const content = JSON.stringify({ mcpServers: merged }, null, 2);
    const tempPath = join(
      tmpdir(),
      `frankenbeast-mcp-${Date.now()}.json`,
    );

    return {
      mcpConfigPath: tempPath,
      cliArgs: ['--mcp-config', tempPath],
      filesToWrite: [{ path: tempPath, content }],
      systemPromptAddition: this.buildContextAddition(skills),
      tools: [],
    };
  }

  private translateForCodex(
    skills: TranslatorSkillInput[],
  ): ProviderSkillConfig {
    if (skills.length === 0) {
      return { systemPromptAddition: '', tools: [] };
    }

    const merged = this.mergeAllServers(skills);
    const content = JSON.stringify({ mcpServers: merged }, null, 2);
    const tempPath = join(
      tmpdir(),
      `frankenbeast-codex-mcp-${Date.now()}.json`,
    );

    return {
      mcpConfigPath: tempPath,
      filesToWrite: [{ path: tempPath, content }],
      systemPromptAddition: this.buildContextAddition(skills),
      tools: [],
    };
  }

  private translateForGemini(
    skills: TranslatorSkillInput[],
  ): ProviderSkillConfig {
    if (skills.length === 0) {
      return { systemPromptAddition: '', tools: [] };
    }

    const merged = this.mergeAllServers(skills);
    const content = JSON.stringify({ mcpServers: merged }, null, 2);
    const tempPath = join(
      tmpdir(),
      `frankenbeast-gemini-settings-${Date.now()}.json`,
    );

    return {
      filesToWrite: [{ path: tempPath, content }],
      systemPromptAddition: this.buildContextAddition(skills),
      tools: [],
    };
  }

  private translateForApi(
    skills: TranslatorSkillInput[],
  ): ProviderSkillConfig {
    return {
      tools: skills.flatMap((s) => s.tools),
      systemPromptAddition: this.buildContextAddition(skills),
      cliArgs: [],
      filesToWrite: [],
    };
  }
}
