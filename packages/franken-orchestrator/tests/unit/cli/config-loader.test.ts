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
    delete process.env['FRANKEN_ENABLE_TRACING'];
    delete process.env['FRANKEN_ENABLE_REFLECTION'];
    delete process.env['FRANKEN_MIN_CRITIQUE_SCORE'];
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

  it('returns defaults when no overrides provided', async () => {
    const config = await loadConfig(makeArgs());
    expect(config.maxCritiqueIterations).toBe(3);
    expect(config.maxTotalTokens).toBe(100_000);
    expect(config.enableHeartbeat).toBe(false);
    expect(config.enableTracing).toBe(false);
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

  it('loads the default operator config file when --config is omitted', async () => {
    const filePath = join(tmpdir(), `beast-default-config-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({ chat: { model: 'persisted-model' } }));

    const config = await loadConfig(makeArgs(), filePath);
    expect(config.chat.model).toBe('persisted-model');
  });

  it('ignores a missing default operator config file', async () => {
    const filePath = join(tmpdir(), `missing-beast-default-config-${Date.now()}.json`);

    const config = await loadConfig(makeArgs(), filePath);
    expect(config.chat.model).toBe('claude-sonnet-4-6');
  });

  it('deep merges nested network config from file', async () => {
    const filePath = join(tmpdir(), `beast-network-config-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({
      chat: { port: 4242 },
      comms: {
        slack: { enabled: true },
      },
    }));

    const config = await loadConfig(makeArgs({ config: filePath }));
    expect(config.chat.port).toBe(4242);
    expect(config.chat.host).toBe('127.0.0.1');
    expect(config.comms.slack.enabled).toBe(true);
    expect(config.comms.discord.enabled).toBe(false);
  });

  it('applies network config --set overrides from CLI', async () => {
    const config = await loadConfig(makeArgs({
      subcommand: 'network',
      networkAction: 'config',
      networkSet: ['chat.model=gpt-5', 'comms.slack.enabled=true', 'beastsDaemon.port=4051'],
    }));

    expect(config.chat.model).toBe('gpt-5');
    expect(config.comms.slack.enabled).toBe(true);
    expect(config.beastsDaemon.port).toBe(4051);
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

  it('CLI init backend overrides the configured secret backend', async () => {
    const filePath = join(tmpdir(), `beast-backend-config-${Date.now()}.json`);
    tmpFiles.push(filePath);
    await writeFile(filePath, JSON.stringify({ network: { secureBackend: 'local-encrypted' } }));

    const config = await loadConfig(makeArgs({ subcommand: 'init', initBackend: '1password', config: filePath }));

    expect(config.network.secureBackend).toBe('1password');
  });

  it('reads strict boolean env vars with common true-like and false-like values', async () => {
    process.env['FRANKEN_ENABLE_HEARTBEAT'] = '1';
    process.env['FRANKEN_ENABLE_TRACING'] = 'TRUE';
    process.env['FRANKEN_ENABLE_REFLECTION'] = 'off';

    const config = await loadConfig(makeArgs());

    expect(config.enableHeartbeat).toBe(true);
    expect(config.enableTracing).toBe(true);
    expect(config.enableReflection).toBe(false);
  });

  it('rejects invalid boolean env vars with a clear error', async () => {
    process.env['FRANKEN_ENABLE_HEARTBEAT'] = 'definitely';

    await expect(loadConfig(makeArgs())).rejects.toThrow(
      'Invalid boolean value for FRANKEN_ENABLE_HEARTBEAT',
    );
  });

  it('does not reject invalid env values shadowed by CLI overrides', async () => {
    process.env['FRANKEN_ENABLE_TRACING'] = 'disabled';

    const config = await loadConfig(makeArgs({ verbose: true }));

    expect(config.enableTracing).toBe(true);
  });

  it('reads numeric env vars', async () => {
    process.env['FRANKEN_MIN_CRITIQUE_SCORE'] = '0.9';
    const config = await loadConfig(makeArgs());
    expect(config.minCritiqueScore).toBe(0.9);
  });
});
