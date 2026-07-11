import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../src/cli/config-loader.js';
import { resolveConfig } from '../../src/cli/run.js';
import type { CliArgs } from '../../src/cli/args.js';

function baseArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    subcommand: undefined,
    baseDir: '.',
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

describe('Config file loading', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `franken-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('FRANKEN_')) {
        delete process.env[key];
      }
    }
  });

  it('reads and parses a JSON config file', async () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      maxCritiqueIterations: 5,
      maxDurationMs: 60000,
      enableTracing: false,
    }));

    const config = await loadConfig(baseArgs({ config: configPath }));

    expect(config.maxCritiqueIterations).toBe(5);
    expect(config.maxDurationMs).toBe(60000);
    expect(config.enableTracing).toBe(false);
  });

  it('CLI args override config file values', async () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      enableTracing: false,
    }));

    // --verbose sets enableTracing = true via fromCli
    const config = await loadConfig(baseArgs({ config: configPath, verbose: true }));

    expect(config.enableTracing).toBe(true);
  });

  it('env vars override config file values', async () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      maxTotalTokens: 50000,
    }));

    process.env['FRANKEN_MAX_TOTAL_TOKENS'] = '200000';

    const config = await loadConfig(baseArgs({ config: configPath }));

    expect(config.maxTotalTokens).toBe(200000);
  });

  it('applies defaults when no config file is provided', async () => {
    const config = await loadConfig(baseArgs());

    // Defaults from OrchestratorConfigSchema
    expect(config.maxCritiqueIterations).toBe(3);
    expect(config.maxTotalTokens).toBe(100_000);
    expect(config.maxDurationMs).toBe(300_000);
    expect(config.enableHeartbeat).toBe(false);
    expect(config.enableTracing).toBe(false);
    expect(config.minCritiqueScore).toBe(0.7);
  });

  it('throws when config file does not exist', async () => {
    const missingPath = join(tmpDir, 'nonexistent.json');

    await expect(resolveConfig(baseArgs({ config: missingPath }))).rejects.toThrow(
      `Config file not found: ${missingPath}`,
    );
  });

  it('throws on invalid JSON in config file', async () => {
    const configPath = join(tmpDir, 'bad.json');
    writeFileSync(configPath, '{ not valid json }');

    await expect(loadConfig(baseArgs({ config: configPath }))).rejects.toThrow();
  });

  it('does not let an explicit repository-local config path self-approve provider command overrides', async () => {
    const configPath = join(tmpDir, '.fbeast', 'config.json');
    mkdirSync(join(tmpDir, '.fbeast'), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/repo-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/repo-controlled'],
          },
        },
      },
    }));

    await expect(loadConfig(
      baseArgs({ config: configPath, trustProviderCommandOverrides: true }),
      configPath,
    )).rejects.toThrow(/repo-configured command override/);
  });

  it('treats alternate config files inside the repository as repo-local for provider command trust', async () => {
    const defaultConfigPath = join(tmpDir, '.fbeast', 'config.json');
    const configPath = join(tmpDir, '.fbeast', 'ci.json');
    mkdirSync(join(tmpDir, '.fbeast'), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/repo-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/repo-controlled'],
          },
        },
      },
    }));

    await expect(loadConfig(
      baseArgs({ config: configPath, trustProviderCommandOverrides: true }),
      defaultConfigPath,
    )).rejects.toThrow(/repo-configured command override/);
  });

  it('treats symlink aliases to repository config as repo-local for provider command trust', async () => {
    const defaultConfigPath = join(tmpDir, '.fbeast', 'config.json');
    const aliasedConfigPath = join(tmpDir, '.fbeast', 'trusted.json');
    mkdirSync(join(tmpDir, '.fbeast'), { recursive: true });
    writeFileSync(defaultConfigPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/repo-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/repo-controlled'],
          },
        },
      },
    }));
    symlinkSync(defaultConfigPath, aliasedConfigPath);

    await expect(loadConfig(
      baseArgs({ config: aliasedConfigPath, trustProviderCommandOverrides: true }),
      defaultConfigPath,
    )).rejects.toThrow(/repo-configured command override/);
  });

  it('allows explicit operator-owned configs outside the repository to approve provider command overrides', async () => {
    const defaultConfigPath = join(tmpDir, 'repo', '.fbeast', 'config.json');
    const configPath = join(tmpDir, 'operator-config.json');
    writeFileSync(configPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/operator-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/operator-controlled'],
          },
        },
      },
    }));

    const config = await loadConfig(
      baseArgs({ config: configPath, trustProviderCommandOverrides: true }),
      defaultConfigPath,
    );

    expect(config.providers.overrides['claude']?.command).toBe('/tmp/operator-controlled/claude-wrapper');
  });

  it('does not derive a repository boundary from non-standard default config paths', async () => {
    const defaultConfigPath = join(tmpDir, 'default.json');
    const configPath = join(tmpDir, 'operator-config.json');
    writeFileSync(configPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/operator-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/operator-controlled'],
          },
        },
      },
    }));

    const config = await loadConfig(
      baseArgs({ config: configPath, trustProviderCommandOverrides: true }),
      defaultConfigPath,
    );

    expect(config.providers.overrides['claude']?.command).toBe('/tmp/operator-controlled/claude-wrapper');
  });

  it('preserves trusted command overrides from non-standard operator-owned default configs', async () => {
    const defaultConfigPath = join(tmpDir, 'operator-default.json');
    writeFileSync(defaultConfigPath, JSON.stringify({
      maxDurationMs: 60000,
      providers: {
        overrides: {
          claude: {
            command: '/tmp/operator-controlled/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/tmp/operator-controlled'],
          },
        },
      },
    }));

    const config = await loadConfig(
      baseArgs({ trustProviderCommandOverrides: true }),
      defaultConfigPath,
    );

    expect(config.providers.overrides['claude']?.command).toBe('/tmp/operator-controlled/claude-wrapper');
  });
});

describe('SessionConfig includes config fields', () => {
  it('SessionConfig interface accepts orchestrator config values', async () => {
    // This is a compile-time check — if SessionConfig doesn't have these fields,
    // TypeScript will fail. We import and create a partial to verify.
    const { Session } = await import('../../src/cli/session.js');
    type SessionConfig = ConstructorParameters<typeof Session>[0];

    // Type assertion — verifies the fields exist at compile time
    const partial: Partial<SessionConfig> = {
      maxCritiqueIterations: 5,
      maxDurationMs: 60000,
      enableTracing: true,
      enableHeartbeat: false,
      minCritiqueScore: 0.8,
      maxTotalTokens: 50000,
    };

    expect(partial.maxCritiqueIterations).toBe(5);
    expect(partial.maxDurationMs).toBe(60000);
    expect(partial.enableTracing).toBe(true);
    expect(partial.enableHeartbeat).toBe(false);
    expect(partial.minCritiqueScore).toBe(0.8);
    expect(partial.maxTotalTokens).toBe(50000);
  });
});
