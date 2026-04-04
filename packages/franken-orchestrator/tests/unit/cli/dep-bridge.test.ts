import { describe, it, expect, vi } from 'vitest';
import { bridgeToBeastConfig, bridgeToExistingDeps } from '../../../src/cli/dep-bridge.js';
import type { CliDepOptions } from '../../../src/cli/dep-factory.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';

function makePaths(overrides: Partial<ProjectPaths> = {}): ProjectPaths {
  return {
    root: '/project',
    frankenbeastDir: '/project/.frankenbeast',
    llmCacheDir: '/project/.frankenbeast/.cache/llm',
    plansDir: '/project/.frankenbeast/plans',
    buildDir: '/project/.frankenbeast/.build',
    beastsDir: '/project/.frankenbeast/.build/beasts',
    beastLogsDir: '/project/.frankenbeast/.build/beasts/logs',
    beastsDb: '/project/.frankenbeast/.build/beasts.db',
    chunkSessionsDir: '/project/.frankenbeast/.build/chunk-sessions',
    chunkSessionSnapshotsDir: '/project/.frankenbeast/.build/chunk-session-snapshots',
    checkpointFile: '/project/.frankenbeast/.build/.checkpoint',
    tracesDb: '/project/.frankenbeast/.build/build-traces.db',
    logFile: '/project/.frankenbeast/.build/build.log',
    designDocFile: '/project/.frankenbeast/plans/design.md',
    configFile: '/project/.frankenbeast/config.json',
    llmResponseFile: '/project/.frankenbeast/plans/llm-response.json',
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

    it('defaults unknown provider to claude-cli', () => {
      const config = bridgeToBeastConfig(makeOptions({ provider: 'some-custom' }));
      expect(config.providers).toEqual([
        { name: 'some-custom', type: 'claude-cli' },
      ]);
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
          claude: { command: '/usr/local/bin/claude' },
        },
      }));
      expect(config.providers).toEqual([
        { name: 'claude', type: 'claude-cli', cliPath: '/usr/local/bin/claude' },
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

    it('enables reflection by default', () => {
      const config = bridgeToBeastConfig(makeOptions({}));
      expect(config.reflection).toBe(true);
    });

    it('derives brain.dbPath from paths.buildDir', () => {
      const config = bridgeToBeastConfig(makeOptions({
        paths: makePaths({ buildDir: '/my/build' }),
      }));
      expect(config.brain?.dbPath).toBe('/my/build/memory.db');
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
