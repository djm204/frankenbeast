import { describe, it, expect, afterEach } from 'vitest';
import { runUninstall } from './uninstall.js';
import { runInit } from './init.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-uninst-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast uninstall', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('removes fbeast MCP entries from settings.json', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(settings.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('preserves non-fbeast MCP entries', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    const settingsPath = join(claudeDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.mcpServers['my-server'] = { command: 'my-cmd' };
    writeFileSync(settingsPath, JSON.stringify(settings));

    runUninstall({ root, claudeDir, purge: false });

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.mcpServers['my-server']).toBeDefined();
    expect(after.mcpServers['fbeast-memory']).toBeUndefined();
  });

  it('removes fbeast-instructions.md', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(true);

    runUninstall({ root, claudeDir, purge: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(false);
  });

  it('keeps .fbeast/ dir without purge', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    runUninstall({ root, claudeDir, purge: false });

    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });

  it('removes .fbeast/ dir with purge', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    runUninstall({ root, claudeDir, purge: true });

    expect(existsSync(join(root, '.fbeast'))).toBe(false);
  });

  it('removes fbeast hooks from settings.json', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: true });
    runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.preToolCall).toEqual([]);
    expect(settings.hooks.postToolCall).toEqual([]);
  });
});
