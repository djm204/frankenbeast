import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillManagerAdapter } from '../../../src/adapters/skill-manager-adapter.js';
import { McpSdkAdapter } from '../../../src/adapters/mcp-sdk-adapter.js';
import { SkillManager } from '../../../src/skills/skill-manager.js';

describe('MCP execution adapters', () => {
  it('SkillManagerAdapter fails closed instead of returning placeholder success', async () => {
    const skillsDir = mkdtempSync(join(tmpdir(), 'franken-skills-'));
    mkdirSync(join(skillsDir, 'search'));
    writeFileSync(join(skillsDir, 'search', 'mcp.json'), JSON.stringify({ mcpServers: { search: { command: 'search' } } }));
    const manager = new SkillManager(skillsDir, new Set(['search']));
    const adapter = new SkillManagerAdapter(manager);

    await expect(adapter.execute('search', {
      objective: 'look this up',
      context: { adrs: [], knownErrors: [], rules: [] },
      dependencyOutputs: new Map(),
      sessionId: 'sess',
      projectId: 'proj',
    })).rejects.toThrow('cannot be executed by SkillManagerAdapter directly');
  });

  it('McpSdkAdapter fails closed when no live MCP transport is configured', async () => {
    const adapter = new McpSdkAdapter([{ name: 'search', serverId: 'search', description: 'Search' }]);

    await expect(adapter.callTool('search', { objective: 'look this up' }))
      .rejects.toThrow('no MCP SDK client/server transport is configured');
  });
});