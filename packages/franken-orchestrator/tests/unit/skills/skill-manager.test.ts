import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { McpConfigSchema } from '@franken/types';
import { SkillManager } from '../../../src/skills/skill-manager.js';

describe('SkillManager', () => {
  let tempDir: string;
  let skillsDir: string;
  let manager: SkillManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skills-test-'));
    skillsDir = join(tempDir, 'skills');
    manager = new SkillManager(skillsDir, new Set());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('listInstalled()', () => {
    it('returns empty array when no skills', () => {
      expect(manager.listInstalled()).toEqual([]);
    });

    it('lists installed skills with metadata', async () => {
      await manager.install({
        name: 'github',
        description: 'GitHub integration',
        provider: 'claude-cli',
        installConfig: { command: 'npx', args: ['-y', '@mcp/github'] },
        authFields: [],
      });

      const skills = manager.listInstalled();
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe('github');
      expect(skills[0]!.mcpServerCount).toBe(1);
      expect(skills[0]!.enabled).toBe(false);
    });

    it('detects hasContext correctly', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      expect(manager.listInstalled()[0]!.hasContext).toBe(false);

      manager.writeContext('github', '# Custom context');
      expect(manager.listInstalled()[0]!.hasContext).toBe(true);
    });

    it('ignores directories without mcp.json', () => {
      mkdirSync(join(skillsDir, 'empty-dir'), { recursive: true });
      expect(manager.listInstalled()).toEqual([]);
    });
  });

  describe('install()', () => {
    it('creates skill directory with mcp.json from catalog entry', async () => {
      await manager.install({
        name: 'github',
        description: 'GitHub',
        provider: 'claude-cli',
        installConfig: { command: 'npx', args: ['-y', '@mcp/github'] },
        authFields: [],
      });

      expect(existsSync(join(skillsDir, 'github', 'mcp.json'))).toBe(true);
    });

    it('mcp.json is valid McpConfig', async () => {
      await manager.install({
        name: 'linear',
        description: 'Linear',
        provider: 'cli',
        installConfig: { command: 'npx', args: ['-y', '@mcp/linear'] },
        authFields: [],
      });

      const raw = JSON.parse(readFileSync(join(skillsDir, 'linear', 'mcp.json'), 'utf-8'));
      expect(() => McpConfigSchema.parse(raw)).not.toThrow();
    });

    it('writes tools.json when catalog entry includes toolDefinitions', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
        toolDefinitions: [
          { name: 'create_issue', description: 'Create issue', inputSchema: {} },
        ],
      });

      expect(existsSync(join(skillsDir, 'github', 'tools.json'))).toBe(true);
      const tools = JSON.parse(readFileSync(join(skillsDir, 'github', 'tools.json'), 'utf-8'));
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('create_issue');
    });
  });

  describe('installCustom()', () => {
    it('creates skill directory with custom mcp.json', async () => {
      await manager.installCustom('my-tool', { command: 'node', args: ['server.js'] });
      expect(manager.exists('my-tool')).toBe(true);
      const config = manager.readMcpConfig('my-tool');
      expect(config?.mcpServers['my-tool']?.command).toBe('node');
    });
  });

  describe('enable()/disable()', () => {
    it('enable adds to active set', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      manager.enable('github');
      expect(manager.getEnabledSkills()).toContain('github');
    });

    it('disable removes from active set', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      manager.enable('github');
      manager.disable('github');
      expect(manager.getEnabledSkills()).not.toContain('github');
    });

    it('enable throws for non-existent skill', () => {
      expect(() => manager.enable('nonexistent')).toThrow("Skill 'nonexistent' is not installed");
    });
  });

  describe('remove()', () => {
    it('deletes skill directory', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      manager.remove('github');
      expect(manager.exists('github')).toBe(false);
    });

    it('removes from enabled set', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      manager.enable('github');
      manager.remove('github');
      expect(manager.getEnabledSkills()).not.toContain('github');
    });

    it('no-op for non-existent skill', () => {
      expect(() => manager.remove('nonexistent')).not.toThrow();
    });
  });

  describe('readContext()/writeContext()', () => {
    it('returns null when no context.md', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      expect(manager.readContext('github')).toBeNull();
    });

    it('reads context.md content', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      writeFileSync(join(skillsDir, 'github', 'context.md'), '# Team rules');
      expect(manager.readContext('github')).toBe('# Team rules');
    });

    it('writes context.md', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      manager.writeContext('github', '# Custom rules');
      expect(readFileSync(join(skillsDir, 'github', 'context.md'), 'utf-8')).toBe('# Custom rules');
    });
  });

  describe('readTools()', () => {
    it('returns empty array when tools.json is missing', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });
      expect(manager.readTools('github')).toEqual([]);
    });

    it('reads and validates normalized tool definitions', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
        toolDefinitions: [
          { name: 'create_issue', description: 'Create', inputSchema: {} },
        ],
      });
      const tools = manager.readTools('github');
      expect(tools).toHaveLength(1);
      expect(tools[0]!.name).toBe('create_issue');
    });
  });

  describe('getEnabledSkills()', () => {
    it('filters out skills not installed on disk', async () => {
      const mgr = new SkillManager(skillsDir, new Set(['ghost']));
      expect(mgr.getEnabledSkills()).toEqual([]);
    });
  });
});
