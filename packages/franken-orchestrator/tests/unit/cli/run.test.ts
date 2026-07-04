import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
  const MockSession = vi.fn(function (this: { start: typeof mockSessionStart }) {
    this.start = mockSessionStart;
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
  getProjectPaths: vi.fn((root: string) => ({
    root,
    frankenbeastDir: `${root}/.fbeast`,
    llmCacheDir: `${root}/.fbeast/.cache/llm`,
    plansDir: `${root}/.fbeast/plans`,
    buildDir: `${root}/.fbeast/.build`,
    beastsDir: `${root}/.fbeast/.build/beasts`,
    beastLogsDir: `${root}/.fbeast/.build/beasts/logs`,
    beastsDb: `${root}/.fbeast/beast.db`,
    checkpointFile: `${root}/.fbeast/.build/.checkpoint`,
    tracesDb: `${root}/.fbeast/.build/build-traces.db`,
    logFile: `${root}/.fbeast/.build/build.log`,
    designDocFile: `${root}/.fbeast/plans/design.md`,
    configFile: `${root}/.fbeast/config.json`,
    llmResponseFile: `${root}/.fbeast/plans/llm-response.json`,
  })),
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
    providers: { default: 'gemini', fallbackChain: [], overrides: {} },
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

import { resolvePhases, createStdinIO, main, runDirectCli, shouldForceDirectCliExit } from '../../../src/cli/run.js';
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

describe('createStdinIO', () => {
  it('returns an object with ask and display functions', () => {
    const io = createStdinIO();
    expect(typeof io.ask).toBe('function');
    expect(typeof io.display).toBe('function');
  });

  it('display delegates to console.log', () => {
    const io = createStdinIO();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    delete process.env.VITE_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_OPERATOR_TOKEN;
    delete process.env.FRANKENBEAST_BEAST_DAEMON_URL;
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

    expect(MockSession).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'claude',
    }));
  });

  it('dispatches chat-server without creating a Session or REPL', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
      allowedOrigins: ['http://localhost:5173'],
      sessionStoreDir: '/mock/project/.fbeast/chat',
      projectName: 'project',
      operatorToken: 'dashboard-operator-token',
      beastControl: expect.objectContaining({
        operatorToken: 'dashboard-operator-token',
      }),
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
      providers: { default: 'gemini', fallbackChain: [], overrides: {} },
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
      providers: { default: 'gemini', fallbackChain: [], overrides: {} },
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

  it('proxies chat-server beast routes only when a daemon URL is explicit', async () => {
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

  it('dispatches network help without creating a Session', async () => {
    mockParseArgs.mockReturnValue({
      subcommand: 'network',
      networkAction: 'help',
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

    expect(MockSession).not.toHaveBeenCalled();
  });

  it('suppresses the banner when running as a network-managed child process', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
