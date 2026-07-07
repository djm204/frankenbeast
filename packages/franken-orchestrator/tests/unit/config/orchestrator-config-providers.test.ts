import { describe, it, expect } from 'vitest';
import { OrchestratorConfigSchema, parseOrchestratorConfig } from '../../../src/config/orchestrator-config.js';

const trustedProviderCommandOverrideOptions = { allowTrustedProviderCommandOverrides: true } as const;

describe('OrchestratorConfigSchema providers section', () => {
  it('produces sensible defaults when parsed with empty object', () => {
    const config = OrchestratorConfigSchema.parse({});
    expect(config.providers).toBeDefined();
    expect(config.providers.default).toBe('claude');
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });

  it('accepts custom default provider', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { default: 'gemini' },
    });
    expect(config.providers.default).toBe('gemini');
    // Other defaults still apply
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });

  it('accepts custom fallback chain', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { fallbackChain: ['gemini', 'aider', 'claude'] },
    });
    expect(config.providers.fallbackChain).toEqual(['gemini', 'aider', 'claude']);
  });

  it('rejects provider command overrides without explicit trust', () => {
    expect(() => OrchestratorConfigSchema.parse({
      providers: {
        overrides: {
          gemini: { command: '/tmp/malicious-gemini' },
        },
      },
    })).toThrow(/trustCommandOverride: true/);
  });

  it('rejects trusted provider command overrides without explicit CLI approval', () => {
    expect(() => OrchestratorConfigSchema.parse({
      providers: {
        overrides: {
          claude: {
            command: '/opt/frankenbeast/bin/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/opt/frankenbeast/bin'],
          },
        },
      },
    })).toThrow(/--trust-provider-command-overrides/);
  });

  it('rejects provider command path overrides that only match by basename when CLI-approved', () => {
    expect(() => parseOrchestratorConfig({
      providers: {
        overrides: {
          claude: { command: '/tmp/claude', trustCommandOverride: true },
        },
      },
    }, trustedProviderCommandOverrideOptions)).toThrow(/absolute path under trustedCommandPaths/);
  });

  it('accepts trusted overrides with command, model, and extraArgs when CLI-approved', () => {
    const config = parseOrchestratorConfig({
      providers: {
        overrides: {
          gemini: {
            command: 'gemini-cli',
            trustCommandOverride: true,
            model: 'gemini-pro',
            extraArgs: ['--temperature', '0.5'],
          },
        },
      },
    }, trustedProviderCommandOverrideOptions);
    const gemini = config.providers.overrides['gemini'];
    expect(gemini).toBeDefined();
    expect(gemini!.command).toBe('gemini-cli');
    expect(gemini!.model).toBe('gemini-pro');
    expect(gemini!.extraArgs).toEqual(['--temperature', '0.5']);
  });

  it('accepts trusted command overrides under trustedCommandPaths when CLI-approved', () => {
    const config = parseOrchestratorConfig({
      providers: {
        overrides: {
          claude: {
            command: '/opt/frankenbeast/bin/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/opt/frankenbeast/bin'],
          },
        },
      },
    }, trustedProviderCommandOverrideOptions);

    expect(config.providers.overrides['claude']).toEqual({
      command: '/opt/frankenbeast/bin/claude-wrapper',
      trustCommandOverride: true,
      trustedCommandPaths: ['/opt/frankenbeast/bin'],
    });
  });

  it('accepts trusted command overrides when trustedCommandPaths has a trailing slash and CLI approval', () => {
    const config = parseOrchestratorConfig({
      providers: {
        overrides: {
          claude: {
            command: '/opt/frankenbeast/bin/claude-wrapper',
            trustCommandOverride: true,
            trustedCommandPaths: ['/opt/frankenbeast/bin/'],
          },
        },
      },
    }, trustedProviderCommandOverrideOptions);

    expect(config.providers.overrides['claude']).toEqual({
      command: '/opt/frankenbeast/bin/claude-wrapper',
      trustCommandOverride: true,
      trustedCommandPaths: ['/opt/frankenbeast/bin/'],
    });
  });

  it('accepts consolidated CLI provider cliPath overrides when trustedCommandPaths has a trailing slash and CLI approval', () => {
    const config = parseOrchestratorConfig({
      consolidatedProviders: [
        {
          name: 'local-claude',
          type: 'claude-cli',
          cliPath: '/opt/frankenbeast/bin/claude-wrapper',
          trustCommandOverride: true,
          trustedCommandPaths: ['/opt/frankenbeast/bin/'],
        },
      ],
    }, trustedProviderCommandOverrideOptions);

    expect(config.consolidatedProviders?.[0]?.trustedCommandPaths).toEqual(['/opt/frankenbeast/bin/']);
  });

  it('accepts overrides with partial fields (all optional)', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: {
        overrides: {
          aider: { model: 'gpt-4o' },
        },
      },
    });
    const aider = config.providers.overrides['aider'];
    expect(aider).toBeDefined();
    expect(aider!.model).toBe('gpt-4o');
    expect(aider!.command).toBeUndefined();
    expect(aider!.extraArgs).toBeUndefined();
  });

  it('accepts empty overrides object', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { overrides: {} },
    });
    expect(config.providers.overrides).toEqual({});
  });

  it('rejects consolidated CLI provider cliPath overrides without trust', () => {
    expect(() => OrchestratorConfigSchema.parse({
      consolidatedProviders: [
        { name: 'local-claude', type: 'claude-cli', cliPath: './tools/claude' },
      ],
    })).toThrow(/trustCommandOverride: true/);
  });

  it('rejects trusted consolidated CLI provider cliPath overrides without explicit CLI approval', () => {
    expect(() => OrchestratorConfigSchema.parse({
      consolidatedProviders: [
        {
          name: 'local-claude',
          type: 'claude-cli',
          cliPath: '/opt/frankenbeast/bin/claude-wrapper',
          trustCommandOverride: true,
          trustedCommandPaths: ['/opt/frankenbeast/bin'],
        },
      ],
    })).toThrow(/--trust-provider-command-overrides/);
  });

  it('rejects consolidated CLI provider cliPath paths outside trustedCommandPaths when CLI-approved', () => {
    expect(() => parseOrchestratorConfig({
      consolidatedProviders: [
        { name: 'local-claude', type: 'claude-cli', cliPath: '/tmp/claude', trustCommandOverride: true },
      ],
    }, trustedProviderCommandOverrideOptions)).toThrow(/absolute path under trustedCommandPaths/);
  });

  it('accepts trusted consolidated CLI provider cliPath overrides under trustedCommandPaths when CLI-approved', () => {
    const config = parseOrchestratorConfig({
      consolidatedProviders: [
        {
          name: 'local-claude',
          type: 'claude-cli',
          cliPath: '/opt/frankenbeast/bin/claude-wrapper',
          trustCommandOverride: true,
          trustedCommandPaths: ['/opt/frankenbeast/bin'],
        },
      ],
    }, trustedProviderCommandOverrideOptions);

    expect(config.consolidatedProviders?.[0]).toEqual({
      name: 'local-claude',
      type: 'claude-cli',
      cliPath: '/opt/frankenbeast/bin/claude-wrapper',
      trustCommandOverride: true,
      trustedCommandPaths: ['/opt/frankenbeast/bin'],
    });
  });

  it('preserves existing config fields alongside providers', () => {
    const config = OrchestratorConfigSchema.parse({
      maxCritiqueIterations: 5,
      providers: { default: 'codex' },
    });
    expect(config.maxCritiqueIterations).toBe(5);
    expect(config.providers.default).toBe('codex');
  });
});
