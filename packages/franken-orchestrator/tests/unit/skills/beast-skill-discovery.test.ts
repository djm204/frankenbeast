import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { SkillManager } from '../../../src/skills/skill-manager.js';

const SKILLS_DIR = resolve(__dirname, '../../../../..', 'skills');

describe('Beast definition skill discovery', () => {
  it('discovers all 3 beast definition skills', () => {
    const manager = new SkillManager(SKILLS_DIR, new Set());
    const skills = manager.listInstalled();
    const names = skills.map((s) => s.name);

    expect(names).toContain('design-interview');
    expect(names).toContain('chunk-plan');
    expect(names).toContain('martin-loop');
  });

  it('each skill has valid mcp.json with mcpServers entry', () => {
    const manager = new SkillManager(SKILLS_DIR, new Set());

    for (const name of ['design-interview', 'chunk-plan', 'martin-loop']) {
      const config = manager.readMcpConfig(name);
      expect(config).not.toBeNull();
      expect(config!.mcpServers).toHaveProperty(name);
      expect(config!.mcpServers[name]!.command).toBe('frankenbeast');
    }
  });

  it('each skill has context.md', () => {
    const manager = new SkillManager(SKILLS_DIR, new Set());

    for (const name of ['design-interview', 'chunk-plan', 'martin-loop']) {
      const context = manager.readContext(name);
      expect(context).not.toBeNull();
      expect(context!.length).toBeGreaterThan(0);
    }
  });

  it('skills reference correct frankenbeast subcommands', () => {
    const manager = new SkillManager(SKILLS_DIR, new Set());

    const interview = manager.readMcpConfig('design-interview');
    expect(interview!.mcpServers['design-interview']!.args).toContain('interview');

    const plan = manager.readMcpConfig('chunk-plan');
    expect(plan!.mcpServers['chunk-plan']!.args).toContain('plan');

    const martin = manager.readMcpConfig('martin-loop');
    expect(martin!.mcpServers['martin-loop']!.args).toContain('run');
  });

  it('all skills set FRANKENBEAST_SPAWNED env var', () => {
    const manager = new SkillManager(SKILLS_DIR, new Set());

    for (const name of ['design-interview', 'chunk-plan', 'martin-loop']) {
      const config = manager.readMcpConfig(name);
      expect(config!.mcpServers[name]!.env).toEqual({ FRANKENBEAST_SPAWNED: '1' });
    }
  });
});
