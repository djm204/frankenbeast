import { describe, it, expect } from 'vitest';
import {
  McpConfigSchema,
  SkillInfoSchema,
  SkillToolManifestSchema,
  SkillsConfigSchema,
  type McpConfig,
  type SkillInfo,
  type SkillToolManifest,
} from '../src/index.js';

describe('McpConfigSchema', () => {
  it('validates a well-formed mcp.json', () => {
    const config: McpConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
        },
      },
    };
    expect(McpConfigSchema.parse(config)).toEqual(config);
  });

  it('validates multiple servers', () => {
    const config: McpConfig = {
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@mcp/github'] },
        linear: { command: 'npx', args: ['-y', '@mcp/linear'] },
      },
    };
    expect(Object.keys(McpConfigSchema.parse(config).mcpServers)).toHaveLength(2);
  });

  it('validates HTTP-based MCP server', () => {
    const config: McpConfig = {
      mcpServers: {
        remote: { command: 'node', url: 'http://localhost:3001/mcp' },
      },
    };
    expect(McpConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects empty command', () => {
    expect(() =>
      McpConfigSchema.parse({ mcpServers: { bad: { command: '' } } }),
    ).toThrow();
  });

  it('rejects missing mcpServers', () => {
    expect(() => McpConfigSchema.parse({})).toThrow();
  });

  it('accepts empty servers map', () => {
    expect(McpConfigSchema.parse({ mcpServers: {} })).toEqual({ mcpServers: {} });
  });
});

describe('SkillInfoSchema', () => {
  it('validates well-formed skill info', () => {
    const info: SkillInfo = {
      name: 'github',
      enabled: true,
      hasContext: false,
      provider: 'claude-cli',
      mcpServerCount: 1,
      installedAt: '2026-03-25T00:00:00.000Z',
    };
    expect(SkillInfoSchema.parse(info)).toEqual(info);
  });

  it('accepts info without optional provider', () => {
    const info = {
      name: 'custom',
      enabled: true,
      hasContext: true,
      mcpServerCount: 2,
      installedAt: '2026-03-25T00:00:00.000Z',
    };
    expect(SkillInfoSchema.parse(info).name).toBe('custom');
  });

  it('rejects empty name', () => {
    expect(() =>
      SkillInfoSchema.parse({
        name: '',
        enabled: true,
        hasContext: false,
        mcpServerCount: 0,
        installedAt: '2026-03-25T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects negative mcpServerCount', () => {
    expect(() =>
      SkillInfoSchema.parse({
        name: 'bad',
        enabled: true,
        hasContext: false,
        mcpServerCount: -1,
        installedAt: '2026-03-25T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects invalid datetime', () => {
    expect(() =>
      SkillInfoSchema.parse({
        name: 'bad',
        enabled: true,
        hasContext: false,
        mcpServerCount: 0,
        installedAt: 'not-a-date',
      }),
    ).toThrow();
  });
});

describe('SkillToolManifestSchema', () => {
  it('validates array of tool definitions', () => {
    const manifest: SkillToolManifest = [
      { name: 'create_issue', description: 'Create an issue', inputSchema: { type: 'object' } },
      { name: 'list_repos', description: 'List repos', inputSchema: {} },
    ];
    expect(SkillToolManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('accepts empty array', () => {
    expect(SkillToolManifestSchema.parse([])).toEqual([]);
  });

  it('rejects tool with empty name', () => {
    expect(() =>
      SkillToolManifestSchema.parse([{ name: '', description: 'x', inputSchema: {} }]),
    ).toThrow();
  });
});

describe('SkillsConfigSchema', () => {
  it('validates array of skill names', () => {
    expect(SkillsConfigSchema.parse(['github', 'linear'])).toEqual(['github', 'linear']);
  });

  it('accepts empty array', () => {
    expect(SkillsConfigSchema.parse([])).toEqual([]);
  });

  it('rejects empty string in array', () => {
    expect(() => SkillsConfigSchema.parse(['github', ''])).toThrow();
  });

  it('rejects non-array', () => {
    expect(() => SkillsConfigSchema.parse('github')).toThrow();
  });
});
