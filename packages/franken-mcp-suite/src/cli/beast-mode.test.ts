import { describe, it, expect, afterEach, vi } from 'vitest';
import { runBeastMode, type BeastModeDeps } from './beast-mode.js';
import { FbeastConfig } from '../shared/config.js';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-beast-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeDeps(root: string, overrides?: Partial<BeastModeDeps>): BeastModeDeps {
  return {
    root,
    confirm: vi.fn().mockResolvedValue(true),
    exec: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('runBeastMode', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('activates beast mode with default provider without prompting', async () => {
    const root = tmpDir();
    dirs.push(root);
    const deps = makeDeps(root);

    await runBeastMode([], deps);

    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.mode).toBe('beast');
    expect(raw.beast.enabled).toBe(true);
    expect(raw.beast.provider).toBe('anthropic-api');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.exec).toHaveBeenCalledWith('frankenbeast', ['beasts', 'catalog']);
  });

  it('activates beast mode with explicit anthropic-api provider', async () => {
    const root = tmpDir();
    dirs.push(root);
    const deps = makeDeps(root);

    await runBeastMode(['--provider=anthropic-api'], deps);

    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.beast.provider).toBe('anthropic-api');
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('requires confirmation for claude-cli provider', async () => {
    const root = tmpDir();
    dirs.push(root);
    const confirm = vi.fn().mockResolvedValue(true);
    const deps = makeDeps(root, { confirm });

    await runBeastMode(['--provider=claude-cli'], deps);

    expect(confirm).toHaveBeenCalledOnce();
    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.beast.provider).toBe('claude-cli');
    expect(raw.beast.acknowledged_cli_risk).toBe(true);
  });

  it('rejects unsupported provider values before saving config or launching beast catalog', async () => {
    const root = tmpDir();
    dirs.push(root);
    const deps = makeDeps(root);
    const configPath = join(root, '.fbeast', 'config.json');

    await expect(runBeastMode(['--provider=local-llm'], deps)).rejects.toThrow(TypeError);
    await expect(runBeastMode(['--provider=local-llm'], deps)).rejects.toThrow(
      'Unsupported beast provider: local-llm',
    );

    expect(existsSync(configPath)).toBe(false);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('aborts if claude-cli confirmation denied', async () => {
    const root = tmpDir();
    dirs.push(root);
    const confirm = vi.fn().mockResolvedValue(false);
    const deps = makeDeps(root, { confirm });

    await expect(runBeastMode(['--provider=claude-cli'], deps)).rejects.toThrow(
      'Beast mode activation aborted',
    );
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('skips confirmation for claude-cli if risk already acknowledged', async () => {
    const root = tmpDir();
    dirs.push(root);

    // Pre-create config with acknowledged risk
    const cfg = FbeastConfig.init(root);
    cfg.beast.acknowledged_cli_risk = true;
    cfg.save();

    const confirm = vi.fn().mockResolvedValue(false);
    const deps = makeDeps(root, { confirm });

    await runBeastMode(['--provider=claude-cli'], deps);

    expect(confirm).not.toHaveBeenCalled();
    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.beast.provider).toBe('claude-cli');
    expect(raw.beast.enabled).toBe(true);
  });

  it('uses existing config if present', async () => {
    const root = tmpDir();
    dirs.push(root);

    // Pre-create config with specific servers
    FbeastConfig.init(root, ['memory', 'planner']);

    const deps = makeDeps(root);
    await runBeastMode([], deps);

    const raw = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(raw.servers).toEqual(['memory', 'planner']);
    expect(raw.mode).toBe('beast');
  });

  it('creates new config if none exists', async () => {
    const root = tmpDir();
    dirs.push(root);
    const configPath = join(root, '.fbeast', 'config.json');

    expect(existsSync(configPath)).toBe(false);

    const deps = makeDeps(root);
    await runBeastMode([], deps);

    expect(existsSync(configPath)).toBe(true);
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(raw.mode).toBe('beast');
  });

  it('prints standalone install guidance when the frankenbeast handoff binary is missing', async () => {
    const root = tmpDir();
    dirs.push(root);
    const deps = makeDeps(root, { exec: vi.fn().mockRejectedValue(new Error('frankenbeast: binary not found')) });
    const mockLog = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await runBeastMode([], deps);

    const message = mockLog.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('npm run local:link');
    expect(message).toContain('npm run local:verify-cli');
    expect(message).not.toContain('npm install -g @franken/orchestrator');
    expect(message).toContain('frankenbeast beasts catalog');
    expect(message).not.toContain('npm link --workspace=franken-orchestrator');
    mockLog.mockRestore();
  });
});
