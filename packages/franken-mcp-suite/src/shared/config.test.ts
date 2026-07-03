import { describe, it, expect, afterEach } from 'vitest';
import { FbeastConfig } from './config.js';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-cfg-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('FbeastConfig', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('creates default config on init', () => {
    const root = tmpDir();
    dirs.push(root);

    const cfg = FbeastConfig.init(root);
    const configPath = join(root, '.fbeast', 'config.json');

    expect(existsSync(configPath)).toBe(true);
    expect(cfg.mode).toBe('mcp');
    expect(cfg.servers).toEqual([
      'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
    ]);
  });

  it('loads existing config', () => {
    const root = tmpDir();
    dirs.push(root);

    const fbDir = join(root, '.fbeast');
    mkdirSync(fbDir, { recursive: true });
    writeFileSync(
      join(fbDir, 'config.json'),
      JSON.stringify({ mode: 'mcp', servers: ['memory'], hooks: true, db: '.fbeast/beast.db', beast: { enabled: false, provider: 'anthropic-api', acknowledged_cli_risk: false } }),
    );

    const cfg = FbeastConfig.load(root);
    expect(cfg.servers).toEqual(['memory']);
    expect(cfg.hooks).toBe(true);
  });

  it('loads copied config anchored to the requested root instead of stale raw root', () => {
    const oldRoot = tmpDir();
    const newRoot = tmpDir();
    dirs.push(oldRoot, newRoot);

    const fbDir = join(newRoot, '.fbeast');
    mkdirSync(fbDir, { recursive: true });
    writeFileSync(
      join(fbDir, 'config.json'),
      JSON.stringify({
        mode: 'mcp',
        root: oldRoot,
        servers: ['memory'],
        hooks: true,
        db: '.fbeast/beast.db',
        beast: { enabled: false, provider: 'anthropic-api', acknowledged_cli_risk: false },
      }),
    );

    const cfg = FbeastConfig.load(newRoot);
    expect(cfg.dbPath).toBe(join(newRoot, '.fbeast', 'beast.db'));

    cfg.hooks = false;
    cfg.save();

    const newRaw = JSON.parse(readFileSync(join(newRoot, '.fbeast', 'config.json'), 'utf-8'));
    expect(newRaw.root).toBe(newRoot);
    expect(newRaw.hooks).toBe(false);
    expect(existsSync(join(oldRoot, '.fbeast', 'config.json'))).toBe(false);
  });

  it('returns dbPath relative to root', () => {
    const root = tmpDir();
    dirs.push(root);

    const cfg = FbeastConfig.init(root);
    expect(cfg.dbPath).toBe(join(root, '.fbeast', 'beast.db'));
  });

  it('save persists changes', () => {
    const root = tmpDir();
    dirs.push(root);

    const cfg = FbeastConfig.init(root);
    cfg.beast.acknowledged_cli_risk = true;
    cfg.save();

    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.beast.acknowledged_cli_risk).toBe(true);
  });
});
