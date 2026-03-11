import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (available inside vi.mock factories) ──

const {
  mockAdapterComplete,
  mockCreateCliDeps,
  mockCreateBeastServices,
  mockFinalize,
  mockParseArgs,
  mockSessionStart,
  mockStartChatServer,
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
    catalog: {},
    dispatch: {},
    runs: {},
    interviews: {},
    metrics: {},
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
    frankenbeastDir: `${root}/.frankenbeast`,
    plansDir: `${root}/.frankenbeast/plans`,
    buildDir: `${root}/.frankenbeast/.build`,
    beastsDir: `${root}/.frankenbeast/.build/beasts`,
    beastLogsDir: `${root}/.frankenbeast/.build/beasts/logs`,
    beastsDb: `${root}/.frankenbeast/.build/beasts.db`,
    checkpointFile: `${root}/.frankenbeast/.build/.checkpoint`,
    tracesDb: `${root}/.frankenbeast/.build/build-traces.db`,
    logFile: `${root}/.frankenbeast/.build/build.log`,
    designDocFile: `${root}/.frankenbeast/plans/design.md`,
    configFile: `${root}/.frankenbeast/config.json`,
    llmResponseFile: `${root}/.frankenbeast/plans/llm-response.json`,
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
    providers: { fallbackChain: [], overrides: {} },
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

import { resolvePhases, createStdinIO, main } from '../../../src/cli/run.js';
import { scaffoldFrankenbeast, resolveProjectRoot, getProjectPaths } from '../../../src/cli/project-root.js';
import { resolveBaseBranch } from '../../../src/cli/base-branch.js';

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
      provider: 'claude',
      providers: ['codex'],
      chatMode: true,
    }));
    expect(mockStartChatServer).toHaveBeenCalledWith(expect.objectContaining({
      host: '127.0.0.1',
      port: 3737,
      allowedOrigins: ['http://localhost:5173'],
      sessionStoreDir: '/mock/project/.frankenbeast/chat',
      projectName: 'project',
      beastControl: expect.objectContaining({
        operatorToken: 'dashboard-operator-token',
      }),
    }));
    expect(MockSession).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:3737'));
    logSpy.mockRestore();
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
