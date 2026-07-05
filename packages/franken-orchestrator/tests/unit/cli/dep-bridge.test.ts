import { describe, it, expect, vi } from 'vitest';
import { bridgeToBeastConfig, bridgeToExistingDeps } from '../../../src/cli/dep-bridge.js';
import type { CliDepOptions } from '../../../src/cli/dep-factory.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';

function makePaths(overrides: Partial<ProjectPaths> = {}): ProjectPaths {
  return {
    root: '/project',
    frankenbeastDir: '/project/.fbeast',
    llmCacheDir: '/project/.fbeast/.cache/llm',
    plansDir: '/project/.fbeast/plans',
    buildDir: '/project/.fbeast/.build',
    beastsDir: '/project/.fbeast/.build/beasts',
    beastLogsDir: '/project/.fbeast/.build/beasts/logs',
    beastsDb: '/project/.fbeast/.build/beasts.db',
    chunkSessionsDir: '/project/.fbeast/.build/chunk-sessions',
    chunkSessionSnapshotsDir: '/project/.fbeast/.build/chunk-session-snapshots',
    checkpointFile: '/project/.fbeast/.build/.checkpoint',
    tracesDb: '/project/.fbeast/.build/build-traces.db',
    logFile: '/project/.fbeast/.build/build.log',
    designDocFile: '/project/.fbeast/plans/design.md',
    configFile: '/project/.fbeast/config.json',
    llmResponseFile: '/project/.fbeast/plans/llm-response.json',
    ...overrides,
  };
}

function makeOptions(overrides: Partial<CliDepOptions> = {}): CliDepOptions {
  return {
    paths: makePaths(),
    baseBranch: 'main',
    budget: 100_000,
    provider: 'claude',
    noPr: false,
    verbose: false,
    reset: false,
    ...overrides,
  };
}

// ─── bridgeToBeastConfig ───

describe('bridgeToBeastConfig()', () => {
  describe('provider mapping', () => {
    it('maps single "claude" provider to claude-cli type', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'claude' }));
      expect(config.providers).toEqual([
        { name: 'claude', type: 'claude-cli' },
      ]);
    });

    it('maps single "codex" provider to codex-cli type', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'codex' }));
      expect(config.providers).toEqual([
        { name: 'codex', type: 'codex-cli' },
      ]);
    });

    it('maps single "gemini" provider to gemini-cli type', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'gemini' }));
      expect(config.providers).toEqual([
        { name: 'gemini', type: 'gemini-cli' },
      ]);
    });

    it('preserves legacy "aider" CLI selection with the consolidated CLI fallback type', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'aider',
        providersConfig: {
          aider: {
            command: '/opt/bin/aider',
            trustCommandOverride: true,
            model: 'gpt-4o',
            extraArgs: ['--yes-always'],
          },
        },
      }));
      expect(config.providers).toEqual([
        {
          name: 'aider',
          type: 'claude-cli',
          cliPath: '/opt/bin/aider',
          model: 'gpt-4o',
          extraArgs: ['--yes-always'],
        },
      ]);
    });

    it('maps "anthropic" to anthropic-api type', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'anthropic' }));
      expect(config.providers).toEqual([
        { name: 'anthropic', type: 'anthropic-api' },
      ]);
    });

    it('maps "openai" to openai-api type', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'openai' }));
      expect(config.providers).toEqual([
        { name: 'openai', type: 'openai-api' },
      ]);
    });

    it('rejects unknown providers instead of guessing by substring', () => {
      expect(() => bridgeToBeastConfig(makeOptions({ provider: 'some-custom' })))
        .toThrowError(/Unknown provider "some-custom"/);
      expect(() => bridgeToBeastConfig(makeOptions({ provider: 'my-openai-wrapper' })))
        .toThrowError(/Unknown provider "my-openai-wrapper"/);
    });

    it('maps multiple providers from options.providers', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'claude',
        providers: ['claude', 'codex', 'gemini'],
      }));
      expect(config.providers).toEqual([
        { name: 'claude', type: 'claude-cli' },
        { name: 'codex', type: 'codex-cli' },
        { name: 'gemini', type: 'gemini-cli' },
      ]);
    });

    it('deduplicates when provider appears in both provider and providers', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'claude',
        providers: ['claude', 'codex'],
      }));
      // primary is first, then the rest (deduped)
      expect(config.providers).toEqual([
        { name: 'claude', type: 'claude-cli' },
        { name: 'codex', type: 'codex-cli' },
      ]);
    });

    it('maps providersConfig.command to cliPath', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'claude',
        providersConfig: {
          claude: { command: '/usr/local/bin/claude', trustCommandOverride: true },
        },
      }));
      expect(config.providers).toEqual([
        { name: 'claude', type: 'claude-cli', cliPath: '/usr/local/bin/claude' },
      ]);
    });

    it('maps providersConfig command, model, and extraArgs through typed provider config', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'gemini',
        providersConfig: {
          gemini: {
            command: '/opt/bin/gemini',
            trustCommandOverride: true,
            model: 'gemini-2.5-pro',
            extraArgs: ['--debug'],
          },
        },
      }));
      expect(config.providers).toEqual([
        {
          name: 'gemini',
          type: 'gemini-cli',
          cliPath: '/opt/bin/gemini',
          model: 'gemini-2.5-pro',
          extraArgs: ['--debug'],
        },
      ]);
    });

    it('uses runConfig.provider as override when present', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'codex',
        runConfig: { provider: 'claude' },
      }));
      // runConfig.provider overrides options.provider
      expect(config.providers![0]).toEqual(
        expect.objectContaining({ name: 'claude', type: 'claude-cli' }),
      );
    });

    it('uses runConfig.llmConfig.default.provider as highest-priority override', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'codex',
        runConfig: {
          provider: 'gemini',
          llmConfig: { default: { provider: 'anthropic' } },
        },
      }));
      expect(config.providers![0]).toEqual(
        expect.objectContaining({ name: 'anthropic', type: 'anthropic-api' }),
      );
    });

    it('forwards runConfig.model into the effective bridged provider', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'codex',
        runConfig: { provider: 'gemini', model: 'gemini-2.5-pro' },
        providers: ['codex', 'gemini'],
      }));

      expect(config.providers).toEqual([
        { name: 'gemini', type: 'gemini-cli', model: 'gemini-2.5-pro' },
        { name: 'codex', type: 'codex-cli' },
      ]);
    });

    it('forwards runConfig.llmConfig.default.model into the effective bridged provider', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'codex',
        providersConfig: {
          claude: { command: '/opt/bin/claude', trustCommandOverride: true, extraArgs: ['--print'] },
        },
        runConfig: {
          provider: 'gemini',
          model: 'gemini-1.5-pro',
          llmConfig: { default: { provider: 'claude', model: 'claude-sonnet-4-20250514' } },
        },
      }));

      expect(config.providers).toEqual([
        {
          name: 'claude',
          type: 'claude-cli',
          cliPath: '/opt/bin/claude',
          model: 'claude-sonnet-4-20250514',
          extraArgs: ['--print'],
        },
      ]);
    });

    it('forwards runConfig.model through the legacy aider provider path', () => {
      const config = bridgeToBeastConfig(makeOptions({
        provider: 'aider',
        providersConfig: {
          aider: { command: '/opt/bin/aider', trustCommandOverride: true },
        },
        runConfig: { model: 'gpt-4o' },
      }));

      expect(config.providers).toEqual([
        { name: 'aider', type: 'claude-cli', cliPath: '/opt/bin/aider', model: 'gpt-4o' },
      ]);
    });
  });

  describe('security tier mapping', () => {
    it('maps STRICT to strict', () => {
      const config = bridgeToBeastConfig(makeOptions({ firewallSecurityTier: 'STRICT' }));
      expect(config.security?.profile).toBe('strict');
    });

    it('maps MODERATE to standard', () => {
      const config = bridgeToBeastConfig(makeOptions({ firewallSecurityTier: 'MODERATE' }));
      expect(config.security?.profile).toBe('standard');
    });

    it('maps PERMISSIVE to permissive', () => {
      const config = bridgeToBeastConfig(makeOptions({ firewallSecurityTier: 'PERMISSIVE' }));
      expect(config.security?.profile).toBe('permissive');
    });

    it('defaults to standard when no tier specified', () => {
      const config = bridgeToBeastConfig(makeOptions({}));
      expect(config.security?.profile).toBe('standard');
    });
  });

  describe('other fields', () => {
    it('passes through skillsDir', () => {
      const config = bridgeToBeastConfig(makeOptions({ skillsDir: '/custom/skills' }));
      expect(config.skillsDir).toBe('/custom/skills');
    });

    it('defaults skillsDir to resolve(paths.root, skills)', () => {
      const config = bridgeToBeastConfig(makeOptions({}));
      expect(config.skillsDir).toBe('/project/skills');
    });

    it('resolves skillsDir relative to custom project root', () => {
      const config = bridgeToBeastConfig(makeOptions({ paths: makePaths({ root: '/tmp/myproj' }) }));
      expect(config.skillsDir).toBe('/tmp/myproj/skills');
    });

    it('defaults configDir to the project .fbeast metadata directory', () => {
      const config = bridgeToBeastConfig(makeOptions({ paths: makePaths({ root: '/tmp/myproj' }) }));
      expect(config.configDir).toBe('/tmp/myproj/.fbeast');
    });

    it('enables reflection by default', () => {
      const config = bridgeToBeastConfig(makeOptions({}));
      expect(config.reflection).toBe(true);
    });

    it('derives brain.dbPath from paths.frankenbeastDir', () => {
      const config = bridgeToBeastConfig(makeOptions({
        paths: makePaths({ frankenbeastDir: '/project/.fbeast' }),
      }));
      expect(config.brain?.dbPath).toBe('/project/.fbeast/beast.db');
    });
  });

  describe('OrchestratorConfig overrides', () => {
    it('uses config.security when provided', () => {
      const orchestratorConfig = { security: { profile: 'strict' } } as any;
      const config = bridgeToBeastConfig(makeOptions({}), orchestratorConfig);
      expect(config.security?.profile).toBe('strict');
    });

    it('uses config.brain.dbPath when provided', () => {
      const orchestratorConfig = { brain: { dbPath: '/custom/brain.db' } } as any;
      const config = bridgeToBeastConfig(makeOptions({}), orchestratorConfig);
      expect(config.brain?.dbPath).toBe('/custom/brain.db');
    });

    it('uses config.consolidatedProviders when provided', () => {
      const orchestratorConfig = {
        consolidatedProviders: [
          { name: 'my-claude', type: 'anthropic-api', apiKey: 'sk-123' },
        ],
      } as any;
      const config = bridgeToBeastConfig(makeOptions({}), orchestratorConfig);
      expect(config.providers).toEqual([
        { name: 'my-claude', type: 'anthropic-api', apiKey: 'sk-123' },
      ]);
    });

    it('uses config.consolidatedProviders before validating CLI-derived providers', () => {
      const orchestratorConfig = {
        consolidatedProviders: [
          { name: 'azure-openai', type: 'openai-api', model: 'gpt-4.1' },
        ],
      } as any;

      const config = bridgeToBeastConfig(
        makeOptions({
          provider: 'azure-openai',
          providers: ['unknown-legacy-provider'],
        }),
        orchestratorConfig,
      );

      expect(config.providers).toEqual([
        { name: 'azure-openai', type: 'openai-api', model: 'gpt-4.1' },
      ]);
    });

    it('falls back to CLI-derived values when config fields are absent', () => {
      const orchestratorConfig = {} as any;
      const config = bridgeToBeastConfig(makeOptions({ provider: 'codex' }), orchestratorConfig);
      expect(config.providers).toEqual([{ name: 'codex', type: 'codex-cli' }]);
      expect(config.security?.profile).toBe('standard');
    });
  });
});

// ─── bridgeToExistingDeps ───

describe('bridgeToExistingDeps()', () => {
  function makeComponents() {
    return {
      planner: { createPlan: vi.fn() } as never,
      critique: { reviewPlan: vi.fn() } as never,
      governor: { requestApproval: vi.fn() } as never,
      observer: {
        startTrace: vi.fn(),
        startSpan: vi.fn(() => ({ end: vi.fn() })),
        getTokenSpend: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  }

  it('assembles required fields into ExistingDeps shape', () => {
    const components = makeComponents();
    const result = bridgeToExistingDeps(components);
    expect(result.planner).toBe(components.planner);
    expect(result.critique).toBe(components.critique);
    expect(result.governor).toBe(components.governor);
    expect(result.observer).toBe(components.observer);
    expect(result.logger).toBe(components.logger);
  });

  it('passes through optional cliExecutor', () => {
    const components = makeComponents();
    const executor = { execute: vi.fn() } as never;
    const result = bridgeToExistingDeps({ ...components, cliExecutor: executor });
    expect(result.cliExecutor).toBe(executor);
  });

  it('passes through optional checkpoint', () => {
    const components = makeComponents();
    const checkpoint = { has: vi.fn(), write: vi.fn() } as never;
    const result = bridgeToExistingDeps({ ...components, checkpoint });
    expect(result.checkpoint).toBe(checkpoint);
  });

  it('passes through optional graphBuilder', () => {
    const components = makeComponents();
    const graphBuilder = { build: vi.fn() } as never;
    const result = bridgeToExistingDeps({ ...components, graphBuilder });
    expect(result.graphBuilder).toBe(graphBuilder);
  });

  it('passes through optional prCreator', () => {
    const components = makeComponents();
    const prCreator = { create: vi.fn() } as never;
    const result = bridgeToExistingDeps({ ...components, prCreator });
    expect(result.prCreator).toBe(prCreator);
  });

  it('passes through optional refreshPlanTasks', () => {
    const components = makeComponents();
    const refreshPlanTasks = vi.fn() as never;
    const result = bridgeToExistingDeps({ ...components, refreshPlanTasks });
    expect(result.refreshPlanTasks).toBe(refreshPlanTasks);
  });

  it('passes through optional runConfigOverrides', () => {
    const components = makeComponents();
    const overrides = { allowedSkills: ['cli:test'] } as never;
    const result = bridgeToExistingDeps({ ...components, runConfigOverrides: overrides });
    expect(result.runConfigOverrides).toBe(overrides);
  });

  it('passes through optional clock', () => {
    const components = makeComponents();
    const clock = () => new Date('2026-01-01');
    const result = bridgeToExistingDeps({ ...components, clock });
    expect(result.clock).toBe(clock);
  });

  it('omits optional fields when not provided', () => {
    const components = makeComponents();
    const result = bridgeToExistingDeps(components);
    expect(result.cliExecutor).toBeUndefined();
    expect(result.checkpoint).toBeUndefined();
    expect(result.prCreator).toBeUndefined();
    expect(result.runConfigOverrides).toBeUndefined();
    expect(result.clock).toBeUndefined();
  });
});
