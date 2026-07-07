import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// ── Hoisted mocks (available inside vi.mock factories) ──

const {
  mockAdapterComplete,
  mockCreateCliDeps,
  mockCreateBeastServices,
  mockFinalize,
  mockParseArgs,
  mockSessionStart,
  mockStartChatServer,
  mockStartBeastDaemon,
  MockAdapterLlmClient,
  MockCliLlmAdapter,
  MockSession,
  mockHandleBeastCommand,
  mockHandleInitCommand,
} = vi.hoisted(() => {
  const mockAdapterComplete = vi.fn(async () => 'mock-complete');
  const mockFinalize = vi.fn(async () => undefined);
  const mockCreateCliDeps = vi.fn(async () => ({
    deps: {},
    cliLlmAdapter: { name: 'chat-adapter' },
    observerBridge: {},
    logger: {},
    finalize: mockFinalize,
  }));
  const mockCreateBeastServices = vi.fn(() => ({
    agents: {},
    catalog: {},
    dispatch: {},
    runs: {},
    interviews: {},
    metrics: {},
    eventBus: {},
    ticketStore: { destroy: vi.fn() },
    dispose: vi.fn(),
  }));
  const mockParseArgs = vi.fn(() => ({
    subcommand: undefined,
    networkAction: undefined,
    networkTarget: undefined,
    networkDetached: false,
    networkSet: undefined,
    baseDir: '/mock/project',
    baseBranch: undefined,
    budget: 10,
    provider: 'claude',
    providerSpecified: false,
    providers: undefined,
    designDoc: undefined,
    planDir: undefined,
    planName: undefined,
    config: undefined,
    host: undefined,
    port: undefined,
    allowOrigin: undefined,
    noPr: false,
    verbose: false,
    reset: false,
    resume: false,
    cleanup: false,
    help: false,
    initVerify: false,
    initRepair: false,
    initNonInteractive: false,
  }));
  const mockSessionStart = vi.fn(async () => ({ status: 'completed' as const }));
  const mockSessionRunIssues = vi.fn(async () => ({ status: 'completed' as const }));
  const MockSession = vi.fn(function (this: { start: typeof mockSessionStart; runIssues: typeof mockSessionRunIssues }) {
    this.start = mockSessionStart;
    this.runIssues = mockSessionRunIssues;
  });
  const mockStartChatServer = vi.fn(async () => ({
    url: 'http://127.0.0.1:3737',
    wsUrl: 'ws://127.0.0.1:3737/v1/chat/ws',
    close: vi.fn(async () => undefined),
    server: {},
  }));
  const mockStartBeastDaemon = vi.fn(async () => ({
    url: 'http://127.0.0.1:4050',
    pidFile: '/mock/project/.frankenbeast/beasts-daemon.pid',
    close: vi.fn(async () => undefined),
    server: {},
  }));
  const MockAdapterLlmClient = vi.fn(function (this: { complete: typeof mockAdapterComplete }) {
    this.complete = mockAdapterComplete;
  });
  const MockCliLlmAdapter = vi.fn(function (this: Record<string, unknown>) {});
  const mockHandleBeastCommand = vi.fn(async () => undefined);
  const mockHandleInitCommand = vi.fn(async () => undefined);
  return {
    mockAdapterComplete,
    mockCreateCliDeps,
    mockCreateBeastServices,
    mockFinalize,
    mockParseArgs,
    mockSessionStart,
    mockStartChatServer,
    mockStartBeastDaemon,
    MockAdapterLlmClient,
    MockCliLlmAdapter,
    MockSession,
    mockHandleBeastCommand,
    mockHandleInitCommand,
  };
});

// ── Mock all dependencies BEFORE importing run.ts ──
// run.ts executes main() on import, so all deps must be mocked first.

vi.mock('../../../src/cli/args.js', () => ({
  parseArgs: mockParseArgs,
  printUsage: vi.fn(),
}));

vi.mock('../../../src/cli/project-root.js', () => ({
  resolveProjectRoot: vi.fn((dir: string) => dir),
  generatePlanName: vi.fn(() => 'plan-2026-03-08'),
  getProjectPaths: vi.fn((root: string, planName?: string) => {
    const plansDir = planName ? `${root}/.fbeast/plans/${planName}` : `${root}/.fbeast/plans`;
    return {
    root,
    frankenbeastDir: `${root}/.fbeast`,
    llmCacheDir: `${root}/.fbeast/.cache/llm`,
    plansDir,
    buildDir: `${root}/.fbeast/.build`,
    beastsDir: `${root}/.fbeast/.build/beasts`,
    beastLogsDir: `${root}/.fbeast/.build/beasts/logs`,
    beastsDb: `${root}/.fbeast/beast.db`,
    checkpointFile: `${root}/.fbeast/.build/.checkpoint`,
    tracesDb: `${root}/.fbeast/.build/build-traces.db`,
    logFile: `${root}/.fbeast/.build/build.log`,
    designDocFile: `${plansDir}/design.md`,
    configFile: `${root}/.fbeast/config.json`,
    llmResponseFile: `${plansDir}/llm-response.json`,
  };
  }),
  scaffoldFrankenbeast: vi.fn(),
}));

vi.mock('../../../src/cli/base-branch.js', () => ({
  resolveBaseBranch: vi.fn(async () => 'main'),
}));

vi.mock('../../../src/cli/session.js', () => ({
  Session: MockSession,
}));

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: mockCreateCliDeps,
}));

vi.mock('../../../src/cli/beast-cli.js', () => ({
  handleBeastCommand: mockHandleBeastCommand,
}));

vi.mock('../../../src/beasts/create-beast-services.js', () => ({
  createBeastServices: mockCreateBeastServices,
}));
vi.mock('../../../src/cli/init-command.js', () => ({
  handleInitCommand: mockHandleInitCommand,
}));

vi.mock('../../../src/http/chat-server.js', () => ({
  startChatServer: mockStartChatServer,
}));

vi.mock('../../../src/http/beast-daemon-server.js', () => ({
  startBeastDaemon: mockStartBeastDaemon,
}));

vi.mock('../../../src/skills/providers/cli-provider.js', () => ({
  createDefaultRegistry: vi.fn(() => ({
    get: vi.fn(() => ({ chatModel: 'chat-model', command: 'claude' })),
  })),
}));

vi.mock('../../../src/adapters/adapter-llm-client.js', () => ({
  AdapterLlmClient: MockAdapterLlmClient,
}));

vi.mock('../../../src/adapters/cli-llm-adapter.js', () => ({
  CliLlmAdapter: MockCliLlmAdapter,
}));

vi.mock('../../../src/logging/beast-logger.js', () => ({
  BANNER: '[BANNER]',
  renderBanner: vi.fn(async () => '[BANNER]'),
  BeastLogger: vi.fn(function (this: Record<string, unknown>) {
    this.info = vi.fn();
    this.warn = vi.fn();
    this.error = vi.fn();
    this.debug = vi.fn();
  }),
}));

vi.mock('../../../src/cli/config-loader.js', () => ({
  loadConfig: vi.fn(async () => ({
    maxCritiqueIterations: 3,
    maxDurationMs: 600_000,
    enableTracing: false,
    enableHeartbeat: false,
    minCritiqueScore: 0.7,
    maxTotalTokens: 100_000,
    providers: { default: 'gemini', fallbackChain: [], overrides: { gemini: { command: 'sh' } } },
    network: { mode: 'secure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
    beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
    chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
    dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
    comms: {
      enabled: false,
      host: '127.0.0.1',
      port: 3200,
      orchestratorWsUrl: 'ws://127.0.0.1:3737/v1/chat/ws',
      slack: { enabled: false },
      discord: { enabled: false },
      telegram: { enabled: false },
      whatsapp: { enabled: false },
    },
  })),
}));

// Mock readline to prevent stdin hanging
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (a: string) => void) => cb('mock-answer')),
    close: vi.fn(),
  })),
}));

// ── Import run.ts exports (main() is guarded, call explicitly in tests) ──

import { resolvePhases, createStdinIO, main, resolveDashboardAllowedOrigins, runDirectCli, shouldForceDirectCliExit, discoverResumeTarget, inferResumeBaseBranch, checkProviderCliAvailability, assertAnyProviderCliAvailable, formatMissingRunPlanGuidance, shouldShowMissingRunPlanGuidance, defaultRunPlanNeedsGuidance, runNetworkCommand } from '../../../src/cli/run.js';
import { loadConfig } from '../../../src/cli/config-loader.js';
import { scaffoldFrankenbeast, resolveProjectRoot, getProjectPaths } from '../../../src/cli/project-root.js';
import { resolveBaseBranch } from '../../../src/cli/base-branch.js';
import { createInterface } from 'node:readline';

// ── Tests ──

describe('resolvePhases', () => {
  it('returns interview entry+exit for interview subcommand', () => {
    const result = resolvePhases({ subcommand: 'interview' });
    expect(result).toEqual({ entryPhase: 'interview', exitAfter: 'interview' });
  });

  it('returns plan entry+exit for plan subcommand', () => {
    const result = resolvePhases({ subcommand: 'plan' });
    expect(result).toEqual({ entryPhase: 'plan', exitAfter: 'plan' });
  });

  it('returns execute entry (no exit) for run subcommand', () => {
    const result = resolvePhases({ subcommand: 'run' });
    expect(result).toEqual({ entryPhase: 'execute' });
  });

  it('returns execute entry for bare resume', () => {
    const result = resolvePhases({ resume: true });
    expect(result).toEqual({ entryPhase: 'execute' });
  });

  it('returns execute entry when planDir is provided', () => {
    const result = resolvePhases({ planDir: '/some/dir' });
    expect(result).toEqual({ entryPhase: 'execute' });
  });

  it('returns plan entry when designDoc is provided', () => {
    const result = resolvePhases({ designDoc: '/some/doc.md' });
    expect(result).toEqual({ entryPhase: 'plan' });
  });

  it('defaults to full interview flow when no subcommand or files', () => {
    const result = resolvePhases({});
    expect(result).toEqual({ entryPhase: 'interview' });
  });

  it('subcommand takes precedence over flags', () => {
    const result = resolvePhases({
      subcommand: 'interview',
      planDir: '/some/dir',
      designDoc: '/some/doc.md',
    });
    expect(result).toEqual({ entryPhase: 'interview', exitAfter: 'interview' });
  });

  it('planDir takes precedence over designDoc', () => {
    const result = resolvePhases({
      planDir: '/some/dir',
      designDoc: '/some/doc.md',
    });
    expect(result).toEqual({ entryPhase: 'execute' });
  });
});

describe('missing run plan guidance', () => {
  it('formats an actionable first-run message for an empty plan directory', () => {
    expect(formatMissingRunPlanGuidance('/project/.fbeast/plans/plan-2026-03-08')).toBe(
      'No runnable default run plan chunks found under /project/.fbeast/plans/plan-2026-03-08. Create it with `frankenbeast plan --design-doc <file> --plan-name plan-2026-03-08`, or run `frankenbeast interview` first and then plan the generated design before running.',
    );
  });

  it('detects an absent or empty default run plan directory', () => {
    const root = join(tmpdir(), `frankenbeast-empty-plan-${Date.now()}`);
    expect(defaultRunPlanNeedsGuidance(root)).toBe(true);

    mkdirSync(root, { recursive: true });
    expect(defaultRunPlanNeedsGuidance(root)).toBe(true);

    writeFileSync(join(root, '00_PLAN.md'), '# plan metadata');
    expect(defaultRunPlanNeedsGuidance(root)).toBe(true);

    writeFileSync(join(root, 'design.md'), '# design');
    expect(defaultRunPlanNeedsGuidance(root)).toBe(true);

    writeFileSync(join(root, '01_IMPLEMENT.md'), '# implementation chunk');
    expect(defaultRunPlanNeedsGuidance(root)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('shows guidance only for default run when the plan directory is absent', () => {
    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'run' },
      true,
    )).toBe(true);

    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'run' },
      false,
    )).toBe(false);

    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'plan' },
      false,
    )).toBe(false);

    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'run', resume: true },
      false,
    )).toBe(false);

    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'run', planDir: '/typo/custom-dir' },
      false,
    )).toBe(false);

    expect(shouldShowMissingRunPlanGuidance(
      { subcommand: 'run', planName: 'existing-empty-plan' },
      false,
    )).toBe(false);
  });
});

describe('provider CLI availability preflight', () => {
  it('reports provider commands and honors command overrides', () => {
    const report = checkProviderCliAvailability('claude', ['codex'], {
      claude: { command: 'sh' },
      codex: { command: 'definitely-missing-frankenbeast-provider-cli' },
    });

    expect(report).toEqual([
      { provider: 'claude', command: 'sh', available: true },
      { provider: 'codex', command: 'definitely-missing-frankenbeast-provider-cli', available: false },
    ]);
  });

  it('throws an actionable error when no configured provider CLI is available', () => {
    expect(() => assertAnyProviderCliAvailable('claude', ['codex'], {
      claude: { command: 'definitely-missing-frankenbeast-claude' },
      codex: { command: 'definitely-missing-frankenbeast-codex' },
    })).toThrow('Install one of: claude, codex, gemini, aider');
  });
});

describe('discoverResumeTarget', () => {
  it('selects the newest plan-scoped checkpoint and extracts the plan name', () => {
    const root = join(tmpdir(), `frankenbeast-resume-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    mkdirSync(buildDir, { recursive: true });

    const older = join(buildDir, 'plan-older.checkpoint');
    const newer = join(buildDir, 'plan-2026-03-07-pluggable-providers.checkpoint');
    writeFileSync(older, 'impl:01:done');
    writeFileSync(newer, 'impl:04:done');
    utimesSync(older, new Date('2026-03-07T00:00:00Z'), new Date('2026-03-07T00:00:00Z'));
    utimesSync(newer, new Date('2026-03-08T00:00:00Z'), new Date('2026-03-08T00:00:00Z'));

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'plan-2026-03-07-pluggable-providers',
      checkpointFile: newer,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('ignores newer legacy checkpoints when selecting a plan-scoped checkpoint', () => {
    const root = join(tmpdir(), `frankenbeast-resume-legacy-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    mkdirSync(buildDir, { recursive: true });

    const legacy = join(buildDir, '.checkpoint');
    const scoped = join(buildDir, 'plan-existing.checkpoint');
    writeFileSync(scoped, 'impl:01:done');
    writeFileSync(legacy, 'impl:02:done');
    utimesSync(scoped, new Date('2026-03-07T00:00:00Z'), new Date('2026-03-07T00:00:00Z'));
    utimesSync(legacy, new Date('2026-03-09T00:00:00Z'), new Date('2026-03-09T00:00:00Z'));

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'plan-existing',
      checkpointFile: scoped,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves a custom plan directory when a matching root directory exists', () => {
    const root = join(tmpdir(), `frankenbeast-resume-custom-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    const customPlanDir = join(root, 'chunks');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(customPlanDir, { recursive: true });

    const checkpoint = join(buildDir, 'chunks.checkpoint');
    writeFileSync(checkpoint, 'impl:01:done');

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'chunks',
      checkpointFile: checkpoint,
      planDir: customPlanDir,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves a custom plan directory directly under .fbeast', () => {
    const root = join(tmpdir(), `frankenbeast-resume-fbeast-custom-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    const customPlanDir = join(root, '.fbeast', 'plans');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(customPlanDir, { recursive: true });

    const checkpoint = join(buildDir, 'plans.checkpoint');
    writeFileSync(checkpoint, 'impl:01:done');

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'plans',
      checkpointFile: checkpoint,
      planDir: customPlanDir,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves a unique nested custom plan directory', () => {
    const root = join(tmpdir(), `frankenbeast-resume-nested-custom-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    const nestedPlanDir = join(root, 'docs', 'chunks');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(nestedPlanDir, { recursive: true });

    const checkpoint = join(buildDir, 'chunks.checkpoint');
    writeFileSync(checkpoint, 'impl:01:done');

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'chunks',
      checkpointFile: checkpoint,
      planDir: nestedPlanDir,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('skips symlinked directories while scanning for nested custom plan dirs', () => {
    const root = join(tmpdir(), `frankenbeast-resume-symlink-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    const nestedPlanDir = join(root, 'docs', 'chunks');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(nestedPlanDir, { recursive: true });
    symlinkSync(root, join(root, 'docs', 'loop'), 'dir');

    const checkpoint = join(buildDir, 'chunks.checkpoint');
    writeFileSync(checkpoint, 'impl:01:done');

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'chunks',
      checkpointFile: checkpoint,
      planDir: nestedPlanDir,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('marks nested custom plan directories as ambiguous when more than one matches', () => {
    const root = join(tmpdir(), `frankenbeast-resume-ambiguous-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    const firstPlanDir = join(root, 'docs', 'chunks');
    const secondPlanDir = join(root, 'notes', 'chunks');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(firstPlanDir, { recursive: true });
    mkdirSync(secondPlanDir, { recursive: true });

    const checkpoint = join(buildDir, 'chunks.checkpoint');
    writeFileSync(checkpoint, 'impl:01:done');

    expect(discoverResumeTarget(root)).toEqual({
      planName: 'chunks',
      checkpointFile: checkpoint,
      ambiguousPlanDir: true,
    });

    rmSync(root, { recursive: true, force: true });
  });

  it('returns undefined when no plan-scoped checkpoints exist', () => {
    const root = join(tmpdir(), `frankenbeast-resume-empty-${Date.now()}`);
    mkdirSync(join(root, '.fbeast', '.build'), { recursive: true });

    expect(discoverResumeTarget(root)).toBeUndefined();

    rmSync(root, { recursive: true, force: true });
  });

  it('defers to the normal base resolver when resume base-branch reflog inference is unavailable', () => {
    const root = join(tmpdir(), `frankenbeast-resume-no-git-${Date.now()}`);
    mkdirSync(root, { recursive: true });

    expect(inferResumeBaseBranch(root)).toBeUndefined();

    rmSync(root, { recursive: true, force: true });
  });

  it('infers the pre-feature base branch while currently on a feature branch', () => {
    const root = join(tmpdir(), `frankenbeast-resume-git-feature-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'test');
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });

    expect(inferResumeBaseBranch(root)).toBe('main');

    rmSync(root, { recursive: true, force: true });
  });

  it('uses the current base branch after checkout returns from a feature branch', () => {
    const root = join(tmpdir(), `frankenbeast-resume-git-base-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'test');
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', 'main'], { cwd: root, stdio: 'ignore' });

    expect(inferResumeBaseBranch(root)).toBe('main');

    rmSync(root, { recursive: true, force: true });
  });

  it('ignores prior feature branches while inferring the resume base branch', () => {
    const root = join(tmpdir(), `frankenbeast-resume-git-feature-to-feature-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'test');
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', 'main'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-05'], { cwd: root, stdio: 'ignore' });

    expect(inferResumeBaseBranch(root)).toBe('main');

    rmSync(root, { recursive: true, force: true });
  });

  it('uses the original conventional base branch after later checkout detours', () => {
    const root = join(tmpdir(), `frankenbeast-resume-git-original-base-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'test');
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'develop'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', 'main'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });

    expect(inferResumeBaseBranch(root)).toBe('develop');

    rmSync(root, { recursive: true, force: true });
  });

  it('ignores inferred base branches that no longer exist', () => {
    const root = join(tmpdir(), `frankenbeast-resume-git-deleted-base-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    writeFileSync(join(root, 'README.md'), 'test');
    execFileSync('git', ['add', 'README.md'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'develop'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'feat/chunk-04'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/develop', 'develop'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['branch', '-D', 'develop'], { cwd: root, stdio: 'ignore' });

    expect(inferResumeBaseBranch(root)).toBeUndefined();

    rmSync(root, { recursive: true, force: true });
  });
});

describe('resolveDashboardAllowedOrigins', () => {
  it('includes localhost as an alias for loopback dashboard defaults', () => {
    expect(resolveDashboardAllowedOrigins({
      dashboard: {
        enabled: true,
        host: '127.0.0.1',
        port: 5173,
        apiUrl: 'http://127.0.0.1:3737',
      },
    } as never)).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
  });

  it('wraps IPv6 loopback origins before allowlisting them', () => {
    expect(resolveDashboardAllowedOrigins({
      dashboard: {
        enabled: true,
        host: '::1',
        port: 5173,
        apiUrl: 'http://127.0.0.1:3737',
      },
    } as never)).toEqual(['http://[::1]:5173', 'http://localhost:5173']);
  });

  it('rejects wildcard dashboard binds when deriving browser origins', () => {
    expect(() => resolveDashboardAllowedOrigins({
      dashboard: {
        enabled: true,
        host: '0.0.0.0',
        port: 5173,
        apiUrl: 'http://127.0.0.1:3737',
      },
    } as never)).toThrow(/loopback-only/);
  });

  it('rejects non-loopback dashboard hosts when deriving browser origins', () => {
    expect(() => resolveDashboardAllowedOrigins({
      dashboard: {
        enabled: true,
        host: 'dashboard.example.com',
        port: 5173,
        apiUrl: 'http://127.0.0.1:3737',
      },
    } as never)).toThrow(/loopback-only/);
  });
});

describe('createStdinIO', () => {
  it('returns an object with ask and display functions', () => {
    const io = createStdinIO();
    expect(typeof io.ask).toBe('function');
    expect(typeof io.display).toBe('function');
  });

  it('display delegates to the console output sink', () => {
    const io = createStdinIO();
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    io.display('hello');
    expect(logSpy).toHaveBeenCalledWith('hello');
    logSpy.mockRestore();
  });

  it('ask returns a promise that resolves to user input', async () => {
    const io = createStdinIO();
    const answer = await io.ask('What?');
    expect(answer).toBe('mock-answer');
  });

  it('close closes readline and pauses stdin so read-only commands can terminate', () => {
    const pauseSpy = vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    const io = createStdinIO();
    const readline = vi.mocked(createInterface).mock.results.at(-1)?.value;

    io.close();

    expect(readline.close).toHaveBeenCalled();
    expect(pauseSpy).toHaveBeenCalled();
    pauseSpy.mockRestore();
  });
});

describe('runDirectCli', () => {
  it('does not force process.exit after successful long-running chat-server startup', async () => {
    const entrypoint = vi.fn(async () => undefined);
    const exit = vi.fn() as unknown as (code?: number) => never;

    runDirectCli(entrypoint, exit, () => false);
    await Promise.resolve();

    expect(entrypoint).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('lets successful direct commands exit naturally so stdout can drain', async () => {
    const entrypoint = vi.fn(async () => undefined);
    const exit = vi.fn() as unknown as (code?: number) => never;

    runDirectCli(entrypoint, exit, () => true);
    await Promise.resolve();

    expect(exit).not.toHaveBeenCalled();
  });

  it('does not force successful direct CLI exits, including catalog and option-shifted beast actions', () => {
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'chat-server'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', 'spawn'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', 'create'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', 'restart'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', 'resume'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', '--base-dir', '/tmp', 'spawn'])).toBe(false);
    expect(shouldForceDirectCliExit(['node', 'run.ts', 'beasts', 'catalog'])).toBe(false);
  });

  it('exits nonzero when the direct CLI entrypoint rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entrypoint = vi.fn(async () => {
      throw new Error('boom');
    });
    const exit = vi.fn() as unknown as (code?: number) => never;

    runDirectCli(entrypoint, exit);
    await Promise.resolve();
    await Promise.resolve();

    expect(exit).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith('Fatal:', 'boom');
    errorSpy.mockRestore();
  });
});

describe('main wiring', () => {
  it('all building blocks are correctly imported and mockable', () => {
    expect(resolveProjectRoot).toBeDefined();
    expect(getProjectPaths).toBeDefined();
    expect(scaffoldFrankenbeast).toBeDefined();
    expect(resolveBaseBranch).toBeDefined();
    expect(MockSession).toBeDefined();
  });

  it('Session receives correct config shape from resolvePhases output', () => {
    const phases = resolvePhases({ subcommand: 'plan' });
    expect(phases.entryPhase).toBe('plan');
    expect(phases.exitAfter).toBe('plan');

    const sessionConfig = {
      paths: getProjectPaths('/test'),
      baseBranch: 'main',
      budget: 10,
      provider: 'claude' as const,
      noPr: false,
      verbose: false,
      reset: false,
      io: { ask: async () => '', display: () => {} },
      ...phases,
    };

    const session = new MockSession(sessionConfig);
    expect(MockSession).toHaveBeenCalledWith(sessionConfig);
    expect(session.start).toBeDefined();
  });
});

describe('main() execution', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_BEAST_OPERATOR_TOKEN = 'dashboard-operator-token';
    mockParseArgs.mockReturnValue({
      subcommand: undefined,
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VITE_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_DAEMON_URL;
    delete process.env.FRANKENBEAST_RUN_CONFIG;
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_PUBLIC_KEY;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scaffolds project and resolves base branch during startup', async () => {
    await main();
    expect(scaffoldFrankenbeast).toHaveBeenCalled();
    expect(resolveBaseBranch).toHaveBeenCalled();
  });

  it('creates a Session and calls start()', async () => {
    await main();
    expect(MockSession).toHaveBeenCalled();
    expect(mockSessionStart).toHaveBeenCalled();
  });

  it('prints actionable guidance before provider preflight when no plan chunks exist', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    mockParseArgs.mockReturnValue({
      subcommand: 'run',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      'No runnable default run plan chunks found under /mock/project/.fbeast/plans/plan-2026-03-08. Create it with `frankenbeast plan --design-doc <file> --plan-name plan-2026-03-08`, or run `frankenbeast interview` first and then plan the generated design before running.',
    );
    expect(MockSession).not.toHaveBeenCalled();
    expect(mockSessionStart).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('passes the run --resume flag into Session config', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: 'run',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: true,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      entryPhase: 'execute',
      resume: true,
    }));
  });

  it('uses FRANKENBEAST_RUN_CONFIG provider for availability preflight before creating the Session', async () => {
    const root = join(tmpdir(), `frankenbeast-run-config-provider-${Date.now()}`);
    const runConfigPath = join(root, 'run-config.json');
    mkdirSync(root, { recursive: true });
    writeFileSync(runConfigPath, JSON.stringify({ provider: 'codex' }));
    tempDirs.push(root);
    process.env.FRANKENBEAST_RUN_CONFIG = runConfigPath;

    vi.mocked(loadConfig).mockResolvedValueOnce({
      maxCritiqueIterations: 3,
      maxDurationMs: 600_000,
      enableTracing: false,
      enableHeartbeat: false,
      minCritiqueScore: 0.7,
      maxTotalTokens: 100_000,
      providers: {
        default: 'claude',
        fallbackChain: [],
        overrides: {
          claude: { command: 'definitely-missing-frankenbeast-claude' },
          codex: { command: 'sh' },
        },
      },
      network: { mode: 'secure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
      beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
      chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
      dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
    } as any);

    await main();

    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'claude',
      orchestratorConfig: expect.objectContaining({
        providers: expect.objectContaining({ default: 'claude' }),
      }),
    }));
  });

  it('auto-detects plan dir and skips base-branch prompt for bare --resume', async () => {
    const root = join(tmpdir(), `frankenbeast-main-resume-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, 'plan-2026-03-07-pluggable-providers.checkpoint'), 'impl:04:done');
    vi.mocked(resolveBaseBranch).mockClear();

    mockParseArgs.mockReturnValue({
      subcommand: undefined,
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: true,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(getProjectPaths).toHaveBeenCalledWith(root, 'plan-2026-03-07-pluggable-providers');
    expect(resolveBaseBranch).toHaveBeenCalledWith(root, undefined, expect.any(Object));
    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      baseBranch: 'main',
      entryPhase: 'execute',
      resume: true,
      paths: expect.objectContaining({
        plansDir: `${root}/.fbeast/plans/plan-2026-03-07-pluggable-providers`,
      }),
    }));

    rmSync(root, { recursive: true, force: true });
  });

  it('does not scope issue resumes to an unrelated execution checkpoint', async () => {
    const root = join(tmpdir(), `frankenbeast-main-issues-resume-${Date.now()}`);
    const buildDir = join(root, '.fbeast', '.build');
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, 'plan-2026-03-07-pluggable-providers.checkpoint'), 'impl:04:done');

    mockParseArgs.mockReturnValue({
      subcommand: 'issues',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: true,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(getProjectPaths).toHaveBeenCalledWith(root, undefined);
    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      entryPhase: 'execute',
      resume: true,
      paths: expect.objectContaining({
        plansDir: `${root}/.fbeast/plans`,
      }),
    }));

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves explicit issue plan names', async () => {
    const root = join(tmpdir(), `frankenbeast-main-issues-plan-name-${Date.now()}`);
    mkdirSync(root, { recursive: true });

    mockParseArgs.mockReturnValue({
      subcommand: 'issues',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: 'batch-13',
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(getProjectPaths).toHaveBeenCalledWith(root, 'batch-13');
    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      entryPhase: 'execute',
      paths: expect.objectContaining({
        plansDir: `${root}/.fbeast/plans/batch-13`,
      }),
    }));

    rmSync(root, { recursive: true, force: true });
  });

  it('uses config.providers.default when --provider is omitted', async () => {
    await main();

    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
    }));
  });

  it('preserves the explicit CLI provider over config.providers.default', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: undefined,
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: true,
      providers: ['gemini'],
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'claude',
    }));
  });

  it('dispatches chat-server without creating a Session or REPL', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(loadConfig).mockResolvedValueOnce({
      maxCritiqueIterations: 3,
      maxDurationMs: 600_000,
      enableTracing: false,
      enableHeartbeat: false,
      minCritiqueScore: 0.7,
      maxTotalTokens: 100_000,
      providers: { default: 'gemini', fallbackChain: [], overrides: { gemini: { command: 'sh' } } },
      security: {
        profile: 'permissive',
        webhookSignaturePolicy: 'local-dev-unsigned',
        customRules: [{ name: 'no-credentials', pattern: 'credential', action: 'block', target: 'request' }],
      },
      network: { mode: 'secure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
      beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
      chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
      dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
      comms: {
        enabled: false,
        host: '127.0.0.1',
        port: 3200,
        orchestratorWsUrl: 'ws://127.0.0.1:3737/v1/chat/ws',
        slack: { enabled: false },
        discord: { enabled: false },
        telegram: { enabled: false },
        whatsapp: { enabled: false },
      },
    } as any);
    mockCreateCliDeps.mockResolvedValueOnce({
      deps: {},
      cliLlmAdapter: { name: 'chat-adapter' },
      observerBridge: {},
      logger: {},
      finalize: mockFinalize,
      skillManager: {},
      providerRegistry: { getProviders: vi.fn(() => []) },
    } as any);
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: ['codex'],
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: '127.0.0.1',
      port: 3737,
      allowOrigin: 'http://localhost:5173',
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(mockCreateCliDeps).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
      providers: ['codex'],
      chatMode: true,
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      host: '127.0.0.1',
      port: 3737,
      allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      sessionStoreDir: '/mock/project/.fbeast/chat',
      projectName: 'project',
      operatorToken: 'dashboard-operator-token',
      beastControl: expect.objectContaining({
        operatorToken: 'dashboard-operator-token',
      }),
    }));
    const startOptions = (mockStartChatServer.mock.calls as any[])[0][0];
    expect(startOptions.dashboardDeps?.getSecurityConfig()).toEqual(expect.objectContaining({
      profile: 'permissive',
      webhookSignaturePolicy: 'local-dev-unsigned',
      customRules: [{ name: 'no-credentials', pattern: 'credential', action: 'block', target: 'request' }],
    }));
    expect(MockSession).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:3737'));
    logSpy.mockRestore();
  });

  it('passes literal uppercase Discord public keys into managed comms config', async () => {
    const publicKey = 'A'.repeat(64);
    process.env.DISCORD_BOT_TOKEN = 'discord-token';
    vi.mocked(loadConfig).mockResolvedValueOnce({
      maxCritiqueIterations: 3,
      maxDurationMs: 600_000,
      enableTracing: false,
      enableHeartbeat: false,
      minCritiqueScore: 0.7,
      maxTotalTokens: 100_000,
      providers: { default: 'gemini', fallbackChain: [], overrides: { gemini: { command: 'sh' } } },
      network: { mode: 'insecure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
      beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
      chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
      dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
      comms: {
        enabled: true,
        host: '127.0.0.1',
        port: 3200,
        orchestratorWsUrl: 'ws://127.0.0.1:3737/v1/chat/ws',
        slack: { enabled: false },
        discord: { enabled: true, botTokenRef: 'DISCORD_BOT_TOKEN', publicKeyRef: publicKey },
        telegram: { enabled: false },
        whatsapp: { enabled: false },
      },
    } as any);
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      commsConfig: expect.objectContaining({
        channels: expect.objectContaining({
          discord: expect.objectContaining({ token: 'discord-token', publicKey }),
        }),
      }),
    }));
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it('prefers the root .env beast operator token for chat-server', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}`);
    tempDirs.push(root);
    mkdirSync(join(root, 'packages', 'franken-web'), { recursive: true });
    writeFileSync(
      join(root, '.env'),
      'FRANKENBEAST_BEAST_OPERATOR_TOKEN=root-env-token\n',
    );
    writeFileSync(
      join(root, 'packages', 'franken-web', '.env.local'),
      'VITE_BEAST_OPERATOR_TOKEN=dashboard-file-token\n',
    );

    delete process.env.VITE_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN;

    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      operatorToken: 'root-env-token',
      beastControl: expect.objectContaining({
        operatorToken: 'root-env-token',
      }),
    }));
  });

  it('falls back to the web env file when root .env has no beast operator token', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-fallback`);
    tempDirs.push(root);
    mkdirSync(join(root, 'packages', 'franken-web'), { recursive: true });
    writeFileSync(
      join(root, '.env'),
      'CHROMA_URL=http://localhost:8000\n',
    );
    writeFileSync(
      join(root, 'packages', 'franken-web', '.env.local'),
      'VITE_BEAST_OPERATOR_TOKEN=dashboard-file-token\n',
    );

    delete process.env.VITE_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN;

    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      operatorToken: 'dashboard-file-token',
      beastControl: expect.objectContaining({
        operatorToken: 'dashboard-file-token',
      }),
    }));
  });

  it('does not treat unresolved Discord public-key refs as literal keys', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-discord-public-key`);
    tempDirs.push(root);
    mkdirSync(join(root, 'packages', 'franken-web'), { recursive: true });
    process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    delete process.env.DISCORD_PUBLIC_KEY;

    vi.mocked(loadConfig).mockImplementationOnce(async () => ({
      maxCritiqueIterations: 3,
      maxDurationMs: 600_000,
      enableTracing: false,
      enableHeartbeat: false,
      minCritiqueScore: 0.7,
      maxTotalTokens: 100_000,
      providers: { default: 'gemini', fallbackChain: [], overrides: { gemini: { command: 'sh' } } },
      network: { mode: 'secure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
      beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
      chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
      dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
      comms: {
        enabled: true,
        host: '127.0.0.1',
        port: 3200,
        orchestratorWsUrl: 'ws://127.0.0.1:3737/v1/chat/ws',
        slack: { enabled: false },
        discord: { enabled: true, botTokenRef: 'DISCORD_BOT_TOKEN', publicKeyRef: 'DISCORD_PUBLIC_KEY' },
        telegram: { enabled: false },
        whatsapp: { enabled: false },
      },
    }) as never);
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    } as never);

    await expect(main()).rejects.toThrow('Cannot start enabled discord comms channel; missing resolved publicKey');
    expect(mockStartChatServer).not.toHaveBeenCalled();
  });

  it('proxies chat-server beast routes when a daemon URL is explicit', async () => {
    process.env.FRANKENBEAST_BEAST_DAEMON_URL = 'http://127.0.0.1:4999';
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    } as never);

    await main();

    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      beastDaemon: expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4999',
        operatorToken: 'dashboard-operator-token',
      }),
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.not.objectContaining({
      beastControl: expect.anything(),
    }));
  });

  it('auto-proxies chat-server beast routes when a live local daemon pidfile exists', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-daemon-pid`);
    tempDirs.push(root);
    mkdirSync(join(root, '.frankenbeast'), { recursive: true });
    writeFileSync(join(root, '.frankenbeast', 'beasts-daemon.pid'), `${process.pid}\n`);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      service: 'beasts-daemon',
      startedAt: '2026-07-05T00:00:00.000Z',
      root,
      pid: process.pid,
    })));
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    } as never);

    await main();

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4050/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockCreateBeastServices).not.toHaveBeenCalled();
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      beastDaemon: expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4050',
        operatorToken: 'dashboard-operator-token',
      }),
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.not.objectContaining({
      beastControl: expect.anything(),
    }));
  });

  it('keeps local beast services when the daemon pidfile is live but health is not reachable', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-daemon-stale`);
    tempDirs.push(root);
    mkdirSync(join(root, '.frankenbeast'), { recursive: true });
    writeFileSync(join(root, '.frankenbeast', 'beasts-daemon.pid'), `${process.pid}\n`);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection refused'); }));
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: root,
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    } as never);

    await main();

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4050/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockCreateBeastServices).toHaveBeenCalledWith(expect.objectContaining({
      beastsDb: join(root, '.fbeast', 'beast.db'),
      beastLogsDir: join(root, '.fbeast', '.build', 'beasts', 'logs'),
      root,
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      beastControl: expect.objectContaining({
        operatorToken: 'dashboard-operator-token',
      }),
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.not.objectContaining({
      beastDaemon: expect.anything(),
    }));
  });

  it('waits for the live daemon pidfile owner to become healthy before falling back', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-daemon-booting`);
    tempDirs.push(root);
    mkdirSync(join(root, '.frankenbeast'), { recursive: true });
    writeFileSync(join(root, '.frankenbeast', 'beasts-daemon.pid'), `${process.pid}\n`);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, service: 'beasts-daemon' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        service: 'beasts-daemon',
        root,
        pid: process.pid,
      }));
    vi.stubGlobal('fetch', fetchMock);
    mockParseArgs.mockReturnValue({
      ...mockParseArgs(),
      subcommand: 'chat-server',
      baseDir: root,
    });

    await main();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockCreateBeastServices).not.toHaveBeenCalled();
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      beastDaemon: expect.objectContaining({ baseUrl: 'http://127.0.0.1:4050' }),
    }));
  });

  it('keeps local beast services when health belongs to a different checkout or pid', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-daemon-other-root`);
    tempDirs.push(root);
    mkdirSync(join(root, '.frankenbeast'), { recursive: true });
    writeFileSync(join(root, '.frankenbeast', 'beasts-daemon.pid'), `${process.pid}\n`);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      service: 'beasts-daemon',
      root: join(tmpdir(), 'other-checkout'),
      pid: process.pid,
    })));
    mockParseArgs.mockReturnValue({
      ...mockParseArgs(),
      subcommand: 'chat-server',
      baseDir: root,
    });

    await main();

    expect(mockCreateBeastServices).toHaveBeenCalledWith(expect.objectContaining({ root }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      beastControl: expect.objectContaining({ operatorToken: 'dashboard-operator-token' }),
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.not.objectContaining({
      beastDaemon: expect.anything(),
    }));
  });

  it('rejects non-loopback plaintext explicit beast daemon URLs before proxying', async () => {
    process.env.FRANKENBEAST_BEAST_DAEMON_URL = 'http://internal-service:4050';
    mockParseArgs.mockReturnValue({
      subcommand: 'chat-server',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    } as never);

    await expect(main()).rejects.toThrow(/FRANKENBEAST_BEAST_DAEMON_URL must use https:\/\//i);
    expect(mockStartChatServer).not.toHaveBeenCalled();
  });

  it('dispatches beasts-daemon without creating a Session or REPL', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: 'beasts-daemon',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: '127.0.0.1',
      port: 4050,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      beastAction: undefined,
      beastTarget: undefined,
    });

    await main();

    expect(mockStartBeastDaemon).toHaveBeenCalledWith(expect.objectContaining({
      root: '/mock/project',
      beastsDb: '/mock/project/.fbeast/beast.db',
      beastLogsDir: '/mock/project/.fbeast/.build/beasts/logs',
      host: '127.0.0.1',
      port: 4050,
      operatorToken: 'dashboard-operator-token',
    }));
    expect(MockSession).not.toHaveBeenCalled();
  });

  it('dispatches beasts commands without creating a Session', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: 'beasts',
      beastAction: 'catalog',
      beastTarget: undefined,
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
    });

    await main();

    expect(mockHandleBeastCommand).toHaveBeenCalled();
    expect(MockSession).not.toHaveBeenCalled();
  });

  it('dispatches init without creating a Session', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: 'init',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/mock/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: true,
      initRepair: false,
      initNonInteractive: true,
    });

    await main();

    expect(mockHandleInitCommand).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.objectContaining({
        subcommand: 'init',
        initVerify: true,
        initNonInteractive: true,
      }),
    }));
    expect(MockSession).not.toHaveBeenCalled();
  });

  it('preserves provider command override approval when saving network config updates', async () => {
    const root = join(tmpdir(), `frankenbeast-run-test-${Date.now()}-trusted-network-save`);
    const configFile = join(root, '.fbeast', 'config.json');
    tempDirs.push(root);
    mkdirSync(join(root, '.fbeast'), { recursive: true });
    writeFileSync(configFile, JSON.stringify({
      providers: {
        overrides: {
          codex: {
            command: '/opt/frankenbeast/bin/codex',
            trustCommandOverride: true,
            trustedCommandPaths: ['/opt/frankenbeast/bin'],
          },
        },
      },
    }, null, 2));

    const print = vi.fn();
    await runNetworkCommand({
      ...(mockParseArgs() as any),
      subcommand: 'network',
      networkAction: 'config',
      networkSet: ['chat.model=gpt-5'],
      config: configFile,
      trustProviderCommandOverrides: true,
    } as never, {
      network: { mode: 'secure', secureBackend: 'local-encrypted', operatorTokenRef: 'operator-token-ref' },
      beastsDaemon: { enabled: true, host: '127.0.0.1', port: 4050 },
      chat: { enabled: true, host: '127.0.0.1', port: 3737, model: 'chat-model' },
      dashboard: { enabled: true, host: '127.0.0.1', port: 5173, apiUrl: 'http://127.0.0.1:3737' },
      comms: { enabled: false, host: '127.0.0.1', port: 3200, slack: { enabled: false }, discord: { enabled: false }, telegram: { enabled: false }, whatsapp: { enabled: false } },
    } as never, root, {
      configFile,
      frankenbeastDir: join(root, '.fbeast'),
    } as never, {
      resolveServices: vi.fn(),
      createSupervisor: vi.fn(() => ({ down: vi.fn(), status: vi.fn(), stop: vi.fn(), logs: vi.fn(), up: vi.fn(), stopAll: vi.fn() })),
      print,
      printError: vi.fn(),
      renderHelp: vi.fn(() => 'network help'),
      waitForShutdown: vi.fn(),
    });

    const saved = JSON.parse(readFileSync(configFile, 'utf-8'));
    expect(saved.providers.overrides.codex).toMatchObject({
      command: '/opt/frankenbeast/bin/codex',
      trustCommandOverride: true,
      trustedCommandPaths: ['/opt/frankenbeast/bin'],
    });
    expect(saved.chat.model).toBe('gpt-5');
    expect(print).toHaveBeenCalledWith(`Saved network config to ${configFile}.`);
  });

  it('dispatches network help without resolving the project root or creating a Session', async () => {
    const resolveProjectRootMock = vi.mocked(resolveProjectRoot);
    resolveProjectRootMock.mockImplementation(() => {
      throw new Error('Project root does not exist: /missing/project');
    });
    mockParseArgs.mockReturnValue({
      subcommand: 'network',
      networkAction: 'help',
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: '/missing/project',
      baseBranch: undefined,
      budget: 10,
      provider: 'claude',
      providerSpecified: false,
      providers: undefined,
      designDoc: undefined,
      planDir: undefined,
      planName: undefined,
      config: undefined,
      host: undefined,
      port: undefined,
      allowOrigin: undefined,
      noPr: false,
      verbose: false,
      reset: false,
      resume: false,
      cleanup: false,
      help: false,
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
    });

    try {
      await main();
    } finally {
      resolveProjectRootMock.mockImplementation((dir: string) => dir);
    }

    expect(resolveProjectRoot).not.toHaveBeenCalled();
    expect(MockSession).not.toHaveBeenCalled();
  });

  it('suppresses the banner when running as a network-managed child process', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const originalManaged = process.env.FRANKENBEAST_NETWORK_MANAGED;
    process.env.FRANKENBEAST_NETWORK_MANAGED = '1';

    try {
      await main();
    } finally {
      if (originalManaged === undefined) {
        delete process.env.FRANKENBEAST_NETWORK_MANAGED;
      } else {
        process.env.FRANKENBEAST_NETWORK_MANAGED = originalManaged;
      }
    }

    expect(logSpy).not.toHaveBeenCalledWith('[BANNER]');
    logSpy.mockRestore();
  });
});
