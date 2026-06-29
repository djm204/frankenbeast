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

  it('SkillManagerAdapter exposes tool-level descriptors for multi-tool MCP skills', () => {
    const skillsDir = mkdtempSync(join(tmpdir(), 'franken-skills-'));
    mkdirSync(join(skillsDir, 'search'));
    writeFileSync(join(skillsDir, 'search', 'mcp.json'), JSON.stringify({ mcpServers: { search: { command: 'search' } } }));
    writeFileSync(join(skillsDir, 'search', 'tools.json'), JSON.stringify([
      { name: 'query', description: 'Query', inputSchema: {} },
      { name: 'summarize', description: 'Summarize', inputSchema: {} },
    ]));
    const manager = new SkillManager(skillsDir, new Set(['search']));
    const adapter = new SkillManagerAdapter(manager);

    expect(adapter.hasSkill('query')).toBe(true);
    expect(adapter.hasSkill('summarize')).toBe(true);
    expect(adapter.hasSkill('search')).toBe(false);
    expect(adapter.getAvailableSkills().map(skill => skill.id)).toEqual(['query', 'summarize']);
  });

  it('SkillManagerAdapter keeps server aliases only when they resolve to one tool', () => {
    const skillsDir = mkdtempSync(join(tmpdir(), 'franken-skills-'));
    mkdirSync(join(skillsDir, 'memory'));
    writeFileSync(join(skillsDir, 'memory', 'mcp.json'), JSON.stringify({ mcpServers: { memory: { command: 'memory' } } }));
    writeFileSync(join(skillsDir, 'memory', 'tools.json'), JSON.stringify([
      { name: 'query', description: 'Query', inputSchema: {} },
    ]));
    const manager = new SkillManager(skillsDir, new Set(['memory']));
    const adapter = new SkillManagerAdapter(manager);

    expect(adapter.hasSkill('memory')).toBe(true);
    expect(adapter.hasSkill('query')).toBe(true);
    expect(adapter.getAvailableSkills().map(skill => skill.id)).toEqual(['memory', 'query']);
  });

  it('McpSdkAdapter fails closed when no live MCP transport is configured', async () => {
    const adapter = new McpSdkAdapter([{ name: 'search', serverId: 'search', description: 'Search' }]);

    await expect(adapter.callTool('search', { objective: 'look this up' }))
      .rejects.toThrow('no MCP SDK client/server transport is configured');
  });
});