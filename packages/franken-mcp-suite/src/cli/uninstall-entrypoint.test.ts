import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const originalArgv = process.argv;
const originalCwd = process.cwd();
const originalHome = process.env.HOME;

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-uninstall-entrypoint-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast-uninstall entrypoint', () => {
  const dirs: string[] = [];

  afterEach(() => {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../shared/is-main.js');
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('forwards the detected Gemini client into uninstall execution', async () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(join(geminiDir, 'settings.json'), JSON.stringify({
      mcpServers: {
        'fbeast-memory': { command: 'fbeast-memory' },
        'other-server': { command: 'other-server' },
      },
      hooks: {
        BeforeTool: [
          { hooks: [{ type: 'command', command: 'fbeast-hook pre' }] },
          { hooks: [{ type: 'command', command: 'other-pre' }] },
        ],
        AfterTool: [
          { hooks: [{ type: 'command', command: 'fbeast-hook post' }] },
          { hooks: [{ type: 'command', command: 'other-post' }] },
        ],
      },
    }));
    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.chdir(root);
    process.argv = ['node', 'fbeast-uninstall', '--purge'];

    await import('./uninstall.js');

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf-8'));
    const before = (settings.hooks?.BeforeTool ?? []) as unknown[];
    const after = (settings.hooks?.AfterTool ?? []) as unknown[];
    const hasFbeast = (list: unknown[]) =>
      list.some((entry: any) => entry.hooks?.some((hook: any) => hook.command?.includes('fbeast')));
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(settings.mcpServers['other-server']).toBeDefined();
    expect(hasFbeast(before)).toBe(false);
    expect(hasFbeast(after)).toBe(false);
  });

  it('falls back to legacy home Claude settings on uninstall when project settings do not exist', async () => {
    const root = tmpDir();
    const home = tmpDir();
    dirs.push(root, home);
    process.env.HOME = home;

    const homeClaudeDir = join(home, '.claude');
    mkdirSync(homeClaudeDir, { recursive: true });
    writeFileSync(join(homeClaudeDir, 'settings.json'), JSON.stringify({
      mcpServers: {
        'fbeast-memory': { command: 'fbeast-memory' },
        'other-server': { command: 'other-server' },
      },
    }));
    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.chdir(root);
    process.argv = ['node', 'fbeast-uninstall', '--client=claude', '--purge'];

    await import('./uninstall.js');

    const homeSettings = JSON.parse(readFileSync(join(homeClaudeDir, 'settings.json'), 'utf-8'));
    expect(homeSettings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(homeSettings.mcpServers['other-server']).toBeDefined();
    expect(existsSync(join(root, '.claude', 'settings.json'))).toBe(false);
  });

  it('honors an explicit Codex client argument', async () => {
    const root = tmpDir();
    dirs.push(root);
    const codexDir = join(root, '.codex');
    const hooksDir = join(codexDir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'fbeast-codex-pre-tool.sh'), '#!/usr/bin/env bash\n');
    writeFileSync(join(hooksDir, 'fbeast-codex-post-tool.sh'), '#!/usr/bin/env bash\n');
    writeFileSync(join(codexDir, 'hooks.json'), JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: join(hooksDir, 'fbeast-codex-pre-tool.sh') }] }],
        PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: join(hooksDir, 'fbeast-codex-post-tool.sh') }] }],
      },
    }));
    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.chdir(root);
    process.argv = ['node', 'fbeast-uninstall', '--client=codex', '--purge'];

    await import('./uninstall.js');

    expect(existsSync(join(codexDir, 'hooks.json'))).toBe(true);
    const hooks = JSON.parse(readFileSync(join(codexDir, 'hooks.json'), 'utf-8'));
    expect(hooks.hooks.PreToolUse).toEqual([]);
    expect(hooks.hooks.PostToolUse).toEqual([]);
    expect(existsSync(join(hooksDir, 'fbeast-codex-pre-tool.sh'))).toBe(false);
    expect(existsSync(join(hooksDir, 'fbeast-codex-post-tool.sh'))).toBe(false);
  });

  it('rejects an invalid explicit client argument', async () => {
    const root = tmpDir();
    dirs.push(root);
    vi.doMock('../shared/is-main.js', () => ({ isMain: () => true }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.chdir(root);
    process.argv = ['node', 'fbeast-uninstall', '--client=codez', '--purge'];

    await expect(import('./uninstall.js')).rejects.toThrow(
      'Invalid --client value "codez". Expected claude, gemini, or codex.',
    );

    expect(console.info).not.toHaveBeenCalledWith('fbeast uninstalled.');
  });
});
