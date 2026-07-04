import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleSkillCommand } from '../../../src/cli/skill-cli.js';
import { SkillManager } from '../../../src/skills/skill-manager.js';
import { SkillConfigStore } from '../../../src/skills/skill-config-store.js';

describe('skill CLI integration', () => {
  const cleanups: string[] = [];

  afterEach(() => {
    for (const dir of cleanups) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanups.length = 0;
  });

  it('adds, enables, lists, and inspects a runnable skill through the real file-backed manager', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skill-cli-'));
    cleanups.push(root);

    const skillsDir = join(root, 'skills');
    const configDir = join(root, '.fbeast');
    const manager = new SkillManager(skillsDir, new Set(), new SkillConfigStore(configDir));
    const printed: string[] = [];
    const print = (message: string) => printed.push(message);

    await handleSkillCommand({
      skillManager: manager,
      action: 'add',
      target: 'github',
      command: 'node',
      commandArgs: ['server.js', '--stdio'],
      print,
    });
    await handleSkillCommand({ skillManager: manager, action: 'enable', target: 'github', print });
    await handleSkillCommand({ skillManager: manager, action: 'list', print });
    await handleSkillCommand({ skillManager: manager, action: 'info', target: 'github', print });

    expect(manager.exists('github')).toBe(true);
    expect(manager.getEnabledSkills()).toEqual(['github']);
    expect(printed).toContain("Installed skill 'github' with MCP command 'node'.");
    expect(printed).toContain("Enabled skill 'github'");
    expect(printed).toContain('  [on] github');

    const info = JSON.parse(printed.at(-1) ?? '{}');
    expect(info.name).toBe('github');
    expect(info.mcpConfig.mcpServers.github.command).toBe('node');
    expect(info.mcpConfig.mcpServers.github.args).toEqual(['server.js', '--stdio']);
  });

  it('scaffolds an explicitly incomplete skill through the real file-backed manager', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skill-cli-'));
    cleanups.push(root);

    const skillsDir = join(root, 'skills');
    const configDir = join(root, '.fbeast');
    const manager = new SkillManager(skillsDir, new Set(), new SkillConfigStore(configDir));
    const printed: string[] = [];
    const print = (message: string) => printed.push(message);

    await handleSkillCommand({ skillManager: manager, action: 'scaffold', target: 'github', print });
    await handleSkillCommand({ skillManager: manager, action: 'info', target: 'github', print });

    expect(manager.exists('github')).toBe(true);
    expect(printed).toContain("Scaffolded incomplete skill 'github' in skills directory.");

    const info = JSON.parse(printed.at(-1) ?? '{}');
    expect(info.mcpConfig.mcpServers.github.command).toBe('node');
    expect(info.mcpConfig.mcpServers.github.args.join(' ')).toContain('was scaffolded but is not configured');
  });
});
