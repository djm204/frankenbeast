import { describe, it, expect, afterEach } from 'vitest';
import { runInit } from './init.js';
import { resolveClaudeConfigDir } from './claude-config-paths.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-init-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast init', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('creates .fbeast dir and config.json', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    expect(existsSync(join(root, '.fbeast', 'config.json'))).toBe(true);
    expect(existsSync(join(root, '.fbeast', 'beast.db'))).toBe(true);
  });

  it('creates .claude dir and drops instructions file', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const instrPath = join(root, '.claude', 'fbeast-instructions.md');
    expect(existsSync(instrPath)).toBe(true);
    const content = readFileSync(instrPath, 'utf-8');
    expect(content).toContain('fbeast_memory_frontload');
  });

  it('writes MCP server config to settings.json', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const settingsPath = join(root, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-planner']).toBeDefined();
    expect(settings.mcpServers['fbeast-critique']).toBeDefined();
    expect(settings.mcpServers['fbeast-firewall']).toBeDefined();
    expect(settings.mcpServers['fbeast-observer']).toBeDefined();
    expect(settings.mcpServers['fbeast-governor']).toBeDefined();
    expect(settings.mcpServers['fbeast-skills']).toBeDefined();
  });

  it('merges with existing settings.json without overwriting', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    const existing = { mcpServers: { 'my-other-server': { command: 'other' } }, customKey: true };
    writeFileSync(settingsPath, JSON.stringify(existing));

    runInit({ root, claudeDir, hooks: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers['my-other-server']).toBeDefined();
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.customKey).toBe(true);
  });

  it('respects pick list', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, servers: ['memory', 'critique'] });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-critique']).toBeDefined();
    expect(settings.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('writes Claude hooks when hooks are enabled', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: true });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    const dbPath = join(root, '.fbeast', 'beast.db');
    expect(settings.hooks.preToolCall).toEqual([
      {
        command: `fbeast-hook pre-tool --db "${dbPath}" $TOOL_NAME`,
        description: 'fbeast governance check',
      },
    ]);
    expect(settings.hooks.postToolCall).toEqual([
      {
        command: `fbeast-hook post-tool --db "${dbPath}" $TOOL_NAME $RESULT`,
        description: 'fbeast observer logging',
      },
    ]);
  });

  it('falls back to home Claude config when project config is missing', () => {
    const cwd = '/tmp/project';
    const homeDir = '/tmp/home';

    const claudeDir = resolveClaudeConfigDir({
      cwd,
      homeDir,
      exists: (path) => path === join(homeDir, '.claude'),
    });

    expect(claudeDir).toBe(join(homeDir, '.claude'));
  });
});
