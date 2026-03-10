import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { loadConfig } from '../../../src/cli/config-loader.js';
import type { CliArgs } from '../../../src/cli/args.js';

describe('Config loader providers passthrough', () => {
  const tmpFiles: string[] = [];

  afterEach(async () => {
    for (const f of tmpFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  function makeArgs(overrides: Partial<CliArgs> = {}): CliArgs {
    return {
      subcommand: undefined,
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
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

  it('returns default providers config when no file provided', async () => {
    const config = await loadConfig(makeArgs());
    expect(config.providers.default).toBe('claude');
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });

  it('passes through providers section from config file', async () => {
    const filePath = join(tmpdir(), `beast-providers-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      providers: {
        default: 'gemini',
        fallbackChain: ['gemini', 'claude'],
        overrides: {
          gemini: { command: 'gemini-cli', model: 'gemini-pro' },
        },
      },
    }));

    const config = await loadConfig(makeArgs({ config: filePath }));
    expect(config.providers.default).toBe('gemini');
    expect(config.providers.fallbackChain).toEqual(['gemini', 'claude']);
    expect(config.providers.overrides['gemini']).toEqual({
      command: 'gemini-cli',
      model: 'gemini-pro',
    });
  });

  it('merges providers with other config fields from file', async () => {
    const filePath = join(tmpdir(), `beast-providers-merge-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      maxTotalTokens: 200_000,
      providers: {
        default: 'aider',
      },
    }));

    const config = await loadConfig(makeArgs({ config: filePath }));
    expect(config.maxTotalTokens).toBe(200_000);
    expect(config.providers.default).toBe('aider');
    // Defaults fill in
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
  });
});
