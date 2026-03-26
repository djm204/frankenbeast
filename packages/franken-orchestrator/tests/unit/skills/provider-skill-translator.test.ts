import { describe, it, expect } from 'vitest';
import type { McpConfig, ToolDefinition, ILlmProvider } from '@franken/types';
import { ProviderSkillTranslator } from '../../../src/skills/provider-skill-translator.js';

type SkillInput = Parameters<ProviderSkillTranslator['translate']>[1][number];

function makeSkill(overrides: Partial<SkillInput> = {}): SkillInput {
  return {
    name: 'github',
    mcpConfig: {
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@mcp/github'] },
      },
    },
    tools: [],
    ...overrides,
  };
}

function mockProvider(type: string): ILlmProvider {
  return { type, name: type, authMethod: 'cli-login', capabilities: {} as any, execute: {} as any, isAvailable: {} as any, formatHandoff: {} as any };
}

const translator = new ProviderSkillTranslator();

describe('ProviderSkillTranslator', () => {
  describe('translateForClaude (claude-cli)', () => {
    it('merges all MCP configs into single file', () => {
      const result = translator.translate(mockProvider('claude-cli'), [
        makeSkill({ name: 'github' }),
        makeSkill({
          name: 'linear',
          mcpConfig: { mcpServers: { linear: { command: 'npx', args: ['-y', '@mcp/linear'] } } },
        }),
      ]);

      expect(result.filesToWrite).toHaveLength(1);
      const content = JSON.parse(result.filesToWrite![0]!.content);
      expect(content.mcpServers.github).toBeDefined();
      expect(content.mcpServers.linear).toBeDefined();
    });

    it('returns --mcp-config arg', () => {
      const result = translator.translate(mockProvider('claude-cli'), [makeSkill()]);
      expect(result.cliArgs).toContain('--mcp-config');
    });

    it('includes context in systemPromptAddition', () => {
      const result = translator.translate(mockProvider('claude-cli'), [
        makeSkill({ context: 'Always use conventional commits' }),
      ]);
      expect(result.systemPromptAddition).toContain('conventional commits');
      expect(result.systemPromptAddition).toContain('github');
    });

    it('skips context for skills without context.md', () => {
      const result = translator.translate(mockProvider('claude-cli'), [makeSkill()]);
      expect(result.systemPromptAddition).toBe('');
    });
  });

  describe('translateForCodex (codex-cli)', () => {
    it('generates codex-compatible config entries', () => {
      const result = translator.translate(mockProvider('codex-cli'), [makeSkill()]);
      expect(result.filesToWrite).toBeDefined();
    });
  });

  describe('translateForGemini (gemini-cli)', () => {
    it('generates settings.json format', () => {
      const result = translator.translate(mockProvider('gemini-cli'), [makeSkill()]);
      expect(result.filesToWrite).toBeDefined();
      const content = JSON.parse(result.filesToWrite![0]!.content);
      expect(content.mcpServers).toBeDefined();
    });
  });

  describe('translateForApi (api adapters)', () => {
    it('returns flattened ToolDefinition[] for enabled skills', () => {
      const tools: ToolDefinition[] = [
        { name: 'create_issue', description: 'Create', inputSchema: {} },
      ];
      const result = translator.translate(mockProvider('anthropic-api'), [
        makeSkill({ tools }),
      ]);
      expect(result.tools).toEqual(tools);
    });

    it('omits skills without tools.json manifests', () => {
      const result = translator.translate(mockProvider('openai-api'), [
        makeSkill({ tools: [] }),
      ]);
      expect(result.tools).toEqual([]);
    });

    it('returns no MCP launch artifacts', () => {
      const result = translator.translate(mockProvider('gemini-api'), [makeSkill()]);
      expect(result.cliArgs).toEqual([]);
      expect(result.filesToWrite).toEqual([]);
    });

    it('includes context in systemPromptAddition', () => {
      const result = translator.translate(mockProvider('anthropic-api'), [
        makeSkill({ context: 'Use Linear project ID X' }),
      ]);
      expect(result.systemPromptAddition).toContain('Linear project ID X');
    });
  });

  it('handles empty skills array', () => {
    const result = translator.translate(mockProvider('claude-cli'), []);
    expect(result.systemPromptAddition).toBe('');
    expect(result.tools).toEqual([]);
  });
});
