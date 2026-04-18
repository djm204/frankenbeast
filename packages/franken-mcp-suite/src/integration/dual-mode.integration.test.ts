import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { runInit } from '../cli/init.js';
import { runBeastMode } from '../cli/beast-mode.js';
import { FbeastConfig } from '../shared/config.js';

function tmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const noopDeps = (root: string) => ({
  root,
  confirm: async () => true,
  exec: async () => {},
});

describe('dual-mode integration', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('keeps Claude config stable while switching from MCP mode to Beast mode', async () => {
    const root = tmpDir('fbeast-dual');
    const claudeDir = join(root, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    dirs.push(root);

    runInit({ root, claudeDir, hooks: true, servers: ['memory', 'planner'] });

    const settingsPath = join(claudeDir, 'settings.json');
    const before = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const mcpBefore = JSON.parse(JSON.stringify(before.mcpServers));

    await runBeastMode(['--provider=anthropic-api'], noopDeps(root));

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.mcpServers).toEqual(mcpBefore);

    const config = FbeastConfig.load(root);
    expect(config.mode).toBe('beast');
  });

  it('shared .fbeast state persists across mode switch', async () => {
    const root = tmpDir('fbeast-persist');
    dirs.push(root);

    const initial = FbeastConfig.init(root, ['memory', 'planner']);
    expect(initial.mode).toBe('mcp');
    expect(initial.servers).toEqual(['memory', 'planner']);

    await runBeastMode(['--provider=anthropic-api'], noopDeps(root));

    const reloaded = FbeastConfig.load(root);
    expect(reloaded.mode).toBe('beast');
    expect(reloaded.beast.enabled).toBe(true);
    expect(reloaded.servers).toEqual(['memory', 'planner']);
  });

  it('config.json retains beast acknowledgment after returning to mcp mode', async () => {
    const root = tmpDir('fbeast-ack');
    dirs.push(root);

    FbeastConfig.init(root);

    await runBeastMode(['--provider=claude-cli'], noopDeps(root));

    const afterBeast = FbeastConfig.load(root);
    expect(afterBeast.beast.acknowledged_cli_risk).toBe(true);
    expect(afterBeast.mode).toBe('beast');

    // Switch back to mcp mode manually
    afterBeast.mode = 'mcp';
    afterBeast.save();

    const final = FbeastConfig.load(root);
    expect(final.mode).toBe('mcp');
    expect(final.beast.acknowledged_cli_risk).toBe(true);
  });
});
