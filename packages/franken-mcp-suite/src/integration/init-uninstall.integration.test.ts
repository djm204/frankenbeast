import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { runInit } from '../cli/init.js';
import { runUninstall } from '../cli/uninstall.js';
import { resolveClientConfigDir } from '../cli/mcp-client-paths.js';

function tmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('init/uninstall integration', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    dirs.length = 0;
  });

  it('writes settings to the fallback Claude dir and removes fbeast entries on uninstall', async () => {
    const root = tmpDir('fbeast-root');
    const homeDir = tmpDir('fbeast-home');
    dirs.push(root, homeDir);

    const claudeDir = resolveClientConfigDir({
      client: 'claude',
      cwd: root,
      homeDir,
      exists: (path) => path === join(homeDir, '.claude'),
    });

    runInit({ root, claudeDir, hooks: false, servers: ['memory'] });

    const settingsPath = join(claudeDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();

    await runUninstall({ root, claudeDir, purge: true });

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.mcpServers['fbeast-memory']).toBeUndefined();
  });
});
