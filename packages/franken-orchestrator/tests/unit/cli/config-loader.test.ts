import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { loadConfig } from '../../../src/cli/config-loader.js';
import type { CliArgs } from '../../../src/cli/args.js';

describe('Config loader', () => {
  const tmpFiles: string[] = [];

  afterEach(async () => {
    for (const f of tmpFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
    // Clean env vars
    delete process.env['FRANKEN_MAX_TOTAL_TOKENS'];
    delete process.env['FRANKEN_ENABLE_HEARTBEAT'];
    delete process.env['FRANKEN_MIN_CRITIQUE_SCORE'];
  });

  function makeArgs(overrides: Partial<CliArgs> = {}): CliArgs {
    return {
      subcommand: undefined,
      baseDir: '/test',
      budget: 10,
      provider: 'claude',
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      help: false,
      ...overrides,
    };
  }

  it('returns defaults when no overrides provided', async () => {
    const config = await loadConfig(makeArgs());
    expect(config.maxCritiqueIterations).toBe(3);
    expect(config.maxTotalTokens).toBe(100_000);
    expect(config.enableHeartbeat).toBe(true);
    expect(config.enableTracing).toBe(true);
    expect(config.minCritiqueScore).toBe(0.7);
  });

  it('loads config from JSON file', async () => {
    const filePath = join(tmpdir(), `beast-config-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({ maxTotalTokens: 50_000, maxCritiqueIterations: 5 }));

    const config = await loadConfig(makeArgs({ config: filePath }));
    expect(config.maxTotalTokens).toBe(50_000);
    expect(config.maxCritiqueIterations).toBe(5);
  });

  it('env vars override file config', async () => {
    const filePath = join(tmpdir(), `beast-config-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({ maxTotalTokens: 50_000 }));

    process.env['FRANKEN_MAX_TOTAL_TOKENS'] = '75000';
    const config = await loadConfig(makeArgs({ config: filePath }));
    expect(config.maxTotalTokens).toBe(75_000);
  });

  it('--verbose enables tracing', async () => {
    const config = await loadConfig(makeArgs({ verbose: true }));
    expect(config.enableTracing).toBe(true);
  });

  it('reads boolean env vars', async () => {
    process.env['FRANKEN_ENABLE_HEARTBEAT'] = 'false';
    const config = await loadConfig(makeArgs());
    expect(config.enableHeartbeat).toBe(false);
  });

  it('reads numeric env vars', async () => {
    process.env['FRANKEN_MIN_CRITIQUE_SCORE'] = '0.9';
    const config = await loadConfig(makeArgs());
    expect(config.minCritiqueScore).toBe(0.9);
  });
});
