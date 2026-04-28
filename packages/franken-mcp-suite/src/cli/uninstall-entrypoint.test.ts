import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const originalArgv = process.argv;
const originalCwd = process.cwd();

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
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
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
});
