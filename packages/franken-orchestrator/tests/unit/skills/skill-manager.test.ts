import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, linkSync } from 'node:fs';
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

    it('rejects invalid catalog MCP configs before writing mcp.json', async () => {
      await expect(manager.install({
        name: 'broken-catalog',
        description: 'Broken catalog entry',
        provider: 'cli',
        installConfig: { command: '' },
        authFields: [],
      })).rejects.toThrow();

      expect(existsSync(join(skillsDir, 'broken-catalog', 'mcp.json'))).toBe(false);
      expect(manager.listInstalled()).toEqual([]);
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
      expect(tools[0]).toMatchObject({
        name: 'create_issue',
        requiresHitl: true,
      });
    });

    it('rejects invalid catalog tool definitions before writing mcp.json', async () => {
      await expect(manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
        toolDefinitions: [
          { name: 'create_issue', inputSchema: {} } as never,
        ],
      })).rejects.toThrow();

      expect(existsSync(join(skillsDir, 'github', 'mcp.json'))).toBe(false);
      expect(manager.exists('github')).toBe(false);
    });

    it('removes stale tool manifests when reinstalling without tool definitions', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx', args: ['old-server'] },
        authFields: [],
        toolDefinitions: [
          { name: 'list_repos', description: 'List', inputSchema: {}, requiresHitl: false },
        ],
      });
      expect(manager.readTools('github')).toEqual([
        expect.objectContaining({ name: 'list_repos', requiresHitl: false }),
      ]);

      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx', args: ['new-server'] },
        authFields: [],
      });

      expect(existsSync(join(skillsDir, 'github', 'tools.json'))).toBe(false);
      expect(manager.readTools('github')).toEqual([]);
    });
  });

  describe('installCustom()', () => {
    it('creates skill directory with custom mcp.json', async () => {
      await manager.installCustom('my-tool', { command: 'node', args: ['server.js'] });
      expect(manager.exists('my-tool')).toBe(true);
      const config = manager.readMcpConfig('my-tool');
      expect(config?.mcpServers['my-tool']?.command).toBe('node');
    });

    it('rejects invalid custom MCP configs before writing mcp.json', async () => {
      await expect(manager.installCustom('broken-custom', {
        command: 'node',
        args: [123],
      } as unknown as Parameters<SkillManager['installCustom']>[1])).rejects.toThrow();

      expect(existsSync(join(skillsDir, 'broken-custom', 'mcp.json'))).toBe(false);
      expect(manager.listInstalled()).toEqual([]);
    });

    it('removes stale tool manifests when replacing a skill with a custom install', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx', args: ['old-server'] },
        authFields: [],
        toolDefinitions: [
          { name: 'list_repos', description: 'List', inputSchema: {}, requiresHitl: false },
        ],
      });

      await manager.installCustom('github', { command: 'node', args: ['server.js'] });

      expect(existsSync(join(skillsDir, 'github', 'tools.json'))).toBe(false);
      expect(manager.readTools('github')).toEqual([]);
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
      expect(tools[0]).toMatchObject({
        name: 'create_issue',
        requiresHitl: true,
      });
    });

    it('preserves explicit safe-tool security review opt-outs', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
        toolDefinitions: [
          { name: 'list_repos', description: 'List', inputSchema: {}, requiresHitl: false },
        ],
      });
      const tools = manager.readTools('github');
      expect(tools).toEqual([
        expect.objectContaining({ name: 'list_repos', requiresHitl: false }),
      ]);
    });
  });

  describe('getEnabledSkills()', () => {
    it('filters out skills not installed on disk', async () => {
      const mgr = new SkillManager(skillsDir, new Set(['ghost']));
      expect(mgr.getEnabledSkills()).toEqual([]);
    });
  });

  describe('path traversal prevention', () => {
    it('rejects names with ..', () => {
      expect(() => manager.remove('../../tmp')).toThrow('Invalid skill name');
    });

    it('rejects names with slashes', async () => {
      await expect(manager.installCustom('foo/bar', { command: 'node' })).rejects.toThrow(/Invalid skill name/);
    });

    it('rejects absolute path names', async () => {
      await expect(manager.installCustom(join(tempDir, 'outside-skill'), { command: 'node' })).rejects.toThrow(/Invalid skill name/);
    });

    it('rejects names with dots only', () => {
      expect(() => manager.readMcpConfig('..')).toThrow('Invalid skill name');
    });

    it('allows valid names with hyphens and underscores', async () => {
      await manager.installCustom('my-tool_v2', { command: 'node' });
      expect(manager.exists('my-tool_v2')).toBe(true);
    });

    it('exists returns false for invalid names without throwing', () => {
      expect(manager.exists('../etc')).toBe(false);
    });

    it('rejects installing into a symlinked skill directory without writing outside the skills root', async () => {
      const outsideDir = join(tempDir, 'other-profile-skill');
      mkdirSync(outsideDir, { recursive: true });
      symlinkSync(outsideDir, join(skillsDir, 'escaped'), 'dir');

      await expect(manager.installCustom('escaped', { command: 'node' }))
        .rejects.toThrow(/Unsafe skill path/);

      expect(existsSync(join(outsideDir, 'mcp.json'))).toBe(false);
    });

    it('rejects catalog installs when mcp.json is a symlink outside the skill directory', async () => {
      const outsideFile = join(tempDir, 'other-profile-mcp.json');
      mkdirSync(join(skillsDir, 'github'), { recursive: true });
      symlinkSync(outsideFile, join(skillsDir, 'github', 'mcp.json'));

      await expect(manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      })).rejects.toThrow(/Unsafe skill path/);

      expect(existsSync(outsideFile)).toBe(false);
    });

    it('rejects context writes when context.md is a symlink outside the skill directory', async () => {
      await manager.installCustom('github', { command: 'node' });
      const outsideFile = join(tempDir, 'outside-context.md');
      symlinkSync(outsideFile, join(skillsDir, 'github', 'context.md'));

      expect(() => manager.writeContext('github', '# escaped')).toThrow(/Unsafe skill path/);
      expect(existsSync(outsideFile)).toBe(false);
    });

    it('rejects installing when the target skill path is an existing file', async () => {
      writeFileSync(join(skillsDir, 'file-skill'), 'not a directory');

      await expect(manager.installCustom('file-skill', { command: 'node' }))
        .rejects.toThrow(/not a directory/);
    });

    it('replaces hard-linked skill files without truncating the linked target', async () => {
      const outsideFile = join(tempDir, 'other-profile-mcp.json');
      writeFileSync(outsideFile, 'do not overwrite');
      mkdirSync(join(skillsDir, 'github'), { recursive: true });
      linkSync(outsideFile, join(skillsDir, 'github', 'mcp.json'));

      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'npx' },
        authFields: [],
      });

      expect(readFileSync(outsideFile, 'utf-8')).toBe('do not overwrite');
      expect(manager.exists('github')).toBe(true);
    });

    it('rejects stale unsafe tools manifests before changing mcp.json', async () => {
      await manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'old-server' },
        authFields: [],
      });
      const before = readFileSync(join(skillsDir, 'github', 'mcp.json'), 'utf-8');
      symlinkSync(join(tempDir, 'outside-tools.json'), join(skillsDir, 'github', 'tools.json'));

      await expect(manager.install({
        name: 'github',
        description: 'GH',
        provider: 'cli',
        installConfig: { command: 'new-server' },
        authFields: [],
      })).rejects.toThrow(/Unsafe skill path/);

      expect(readFileSync(join(skillsDir, 'github', 'mcp.json'), 'utf-8')).toBe(before);
    });

    it('removes a symlinked skill entry without deleting its target', () => {
      const outsideDir = join(tempDir, 'other-profile-skill');
      mkdirSync(outsideDir, { recursive: true });
      symlinkSync(outsideDir, join(skillsDir, 'escaped'), 'dir');

      expect(() => manager.remove('escaped')).not.toThrow();
      expect(existsSync(join(skillsDir, 'escaped'))).toBe(false);
      expect(existsSync(outsideDir)).toBe(true);
    });

    it('resolves relative skills roots once at construction time', async () => {
      const originalCwd = process.cwd();
      const otherCwd = mkdtempSync(join(tempDir, 'other-cwd-'));
      try {
        process.chdir(tempDir);
        const relativeManager = new SkillManager('relative-skills', new Set());
        process.chdir(otherCwd);

        await relativeManager.installCustom('github', { command: 'node' });

        expect(existsSync(join(tempDir, 'relative-skills', 'github', 'mcp.json'))).toBe(true);
        expect(existsSync(join(otherCwd, 'relative-skills', 'github', 'mcp.json'))).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
