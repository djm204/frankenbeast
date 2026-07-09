import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises';
import { loadConfig } from '../../../src/cli/config-loader.js';
import type { CliArgs } from '../../../src/cli/args.js';

describe('Config loader providers passthrough', () => {
  const tmpFiles: string[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const f of tmpFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    for (const dir of tmpDirs) {
      try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
    tmpDirs.length = 0;
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

  it('rejects trusted provider command overrides from config file without CLI approval', async () => {
    const filePath = join(tmpdir(), `beast-providers-unapproved-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      providers: {
        overrides: {
          gemini: { command: 'gemini-cli', trustCommandOverride: true, model: 'gemini-pro' },
        },
      },
    }));

    await expect(loadConfig(makeArgs({ config: filePath }))).rejects.toThrow(/--trust-provider-command-overrides/);
  });

  it('passes through CLI-approved providers section from explicit config file', async () => {
    const filePath = join(tmpdir(), `beast-providers-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      providers: {
        default: 'gemini',
        fallbackChain: ['gemini', 'claude'],
        overrides: {
          gemini: { command: 'gemini-cli', trustCommandOverride: true, model: 'gemini-pro' },
        },
      },
    }));

    const config = await loadConfig(makeArgs({
      config: filePath,
      trustProviderCommandOverrides: true,
    }));
    expect(config.providers.default).toBe('gemini');
    expect(config.providers.fallbackChain).toEqual(['gemini', 'claude']);
    expect(config.providers.overrides['gemini']).toEqual({
      command: 'gemini-cli',
      trustCommandOverride: true,
      model: 'gemini-pro',
    });
  });

  it('does not let repository-local provider overrides self-approve trust', async () => {
    const filePath = join(tmpdir(), `beast-repo-provider-trust-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      providers: {
        overrides: {
          claude: {
            command: '/tmp/repo/malicious-claude',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/repo'],
          },
        },
      },
    }));

    await expect(loadConfig(makeArgs(), filePath)).rejects.toThrow(/trustCommandOverride: true/);
  });

  it('requires CLI approval before a repository-local config can trust an allowed provider binary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'beast-repo-config-json-'));
    const filePath = join(root, 'config.json');
    tmpDirs.push(root);
    await writeFile(filePath, JSON.stringify({
      providers: {
        overrides: {
          claude: {
            command: 'claude',
            trustCommandOverride: true,
          },
        },
      },
    }));

    await expect(loadConfig(makeArgs(), filePath)).rejects.toThrow(/trustCommandOverride: true/);

    const approved = await loadConfig(makeArgs({ trustProviderCommandOverrides: true }), filePath);
    expect(approved.providers.overrides['claude']).toEqual({
      command: 'claude',
      trustCommandOverride: true,
    });
  });

  it('honors CLI approval for trusted overrides in the default config path', async () => {
    const filePath = join(tmpdir(), `beast-repo-provider-trust-approved-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      providers: {
        overrides: {
          claude: {
            command: '/usr/local/bin/claude',
            trustCommandOverride: true,
            trustedCommandPaths: ['/usr/local/bin'],
          },
        },
      },
    }));

    const config = await loadConfig(makeArgs({ trustProviderCommandOverrides: true }), filePath);
    expect(config.providers.overrides['claude']).toMatchObject({
      command: '/usr/local/bin/claude',
      trustCommandOverride: true,
      trustedCommandPaths: ['/usr/local/bin'],
    });
  });

  it('does not let repository-local consolidated providers self-approve trust', async () => {
    const filePath = join(tmpdir(), `beast-repo-consolidated-trust-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      consolidatedProviders: [{
        name: 'local-claude',
        type: 'claude-cli',
        cliPath: '/tmp/repo/malicious-claude',
        trustCommandOverride: true,
        trustedCommandPaths: ['/tmp/repo'],
      }],
    }));

    await expect(loadConfig(makeArgs(), filePath)).rejects.toThrow(/trustCommandOverride: true/);
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
