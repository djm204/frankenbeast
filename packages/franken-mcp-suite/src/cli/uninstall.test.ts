import { describe, it, expect, afterEach, vi } from 'vitest';
import { runUninstall } from './uninstall.js';
import { runInit } from './init.js';
import { confirmYesNo } from './prompt.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-uninst-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast uninstall', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('removes fbeast MCP entries from settings.json', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(settings.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('preserves non-fbeast MCP entries', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    const settingsPath = join(claudeDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.mcpServers['my-server'] = { command: 'my-cmd' };
    writeFileSync(settingsPath, JSON.stringify(settings));

    await runUninstall({ root, claudeDir, purge: false });

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.mcpServers['my-server']).toBeDefined();
    expect(after.mcpServers['fbeast-memory']).toBeUndefined();
  });

  it('removes fbeast-instructions.md', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(true);

    await runUninstall({ root, claudeDir, purge: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(false);
  });

  it('keeps .fbeast/ dir without purge', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: false });

    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });

  it('removes .fbeast/ dir with purge', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: true });

    expect(existsSync(join(root, '.fbeast'))).toBe(false);
  });

  it('removes fbeast hooks from settings.json', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: true });
    await runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.preToolCall).toEqual([]);
    expect(settings.hooks.postToolCall).toEqual([]);
  });

  it('accepts yes answers for purge confirmation prompts', async () => {
    await expect(confirmYesNo('Remove stored data?', async () => 'yes')).resolves.toBe(true);
    await expect(confirmYesNo('Remove stored data?', async () => 'Y')).resolves.toBe(true);
  });

  it('prompts before purge when explicit decision is missing', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    await runUninstall({
      root,
      claudeDir,
      ask: async () => 'yes',
    });

    expect(existsSync(join(root, '.fbeast'))).toBe(false);
  });

  it('treats closed stdin as a no answer when purge decision is missing', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    const stdin = Object.assign(new PassThrough(), { isTTY: false });
    const stdout = new PassThrough();
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as typeof process.stdin);
    vi.spyOn(process, 'stdout', 'get').mockReturnValue(stdout as typeof process.stdout);

    const uninstallPromise = runUninstall({ root, claudeDir });
    stdin.end();

    await expect(Promise.race([
      uninstallPromise.then(() => 'completed'),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for uninstall')), 50)),
    ])).resolves.toBe('completed');

    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });
});
