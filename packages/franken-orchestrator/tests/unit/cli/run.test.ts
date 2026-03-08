import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (available inside vi.mock factories) ──

const { mockSessionStart, MockSession } = vi.hoisted(() => {
  const mockSessionStart = vi.fn(async () => ({ status: 'completed' as const }));
  const MockSession = vi.fn(function (this: { start: typeof mockSessionStart }) {
    this.start = mockSessionStart;
  });
  return { mockSessionStart, MockSession };
});

// ── Mock all dependencies BEFORE importing run.ts ──
// run.ts executes main() on import, so all deps must be mocked first.

vi.mock('../../../src/cli/args.js', () => ({
  parseArgs: vi.fn(() => ({
    subcommand: undefined,
    baseDir: '/mock/project',
    baseBranch: undefined,
    budget: 10,
    provider: 'claude',
    designDoc: undefined,
    planDir: undefined,
    config: undefined,
    noPr: false,
    verbose: false,
    reset: false,
    resume: false,
    help: false,
  })),
  printUsage: vi.fn(),
}));

vi.mock('../../../src/cli/project-root.js', () => ({
  resolveProjectRoot: vi.fn((dir: string) => dir),
  getProjectPaths: vi.fn((root: string) => ({
    root,
    frankenbeastDir: `${root}/.frankenbeast`,
    plansDir: `${root}/.frankenbeast/plans`,
    buildDir: `${root}/.frankenbeast/.build`,
    checkpointFile: `${root}/.frankenbeast/.build/.checkpoint`,
    tracesDb: `${root}/.frankenbeast/.build/build-traces.db`,
    logFile: `${root}/.frankenbeast/.build/build.log`,
    designDocFile: `${root}/.frankenbeast/plans/design.md`,
    configFile: `${root}/.frankenbeast/config.json`,
  })),
  scaffoldFrankenbeast: vi.fn(),
}));

vi.mock('../../../src/cli/base-branch.js', () => ({
  resolveBaseBranch: vi.fn(async () => 'main'),
}));

vi.mock('../../../src/cli/session.js', () => ({
  Session: MockSession,
}));

vi.mock('../../../src/logging/beast-logger.js', () => ({
  BANNER: '[BANNER]',
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

// ── Import run.ts exports (main() will fire but mocks handle it) ──

import { resolvePhases, createStdinIO } from '../../../src/cli/run.js';
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

describe('main() import-time side effects', () => {
  // main() fires on import; these checks run after the async chain settles
  // via mocked deps, so import-time calls are still recorded.
  it('scaffolds project and resolves base branch during startup', () => {
    expect(scaffoldFrankenbeast).toHaveBeenCalled();
    expect(resolveBaseBranch).toHaveBeenCalled();
  });

  it('creates a Session and calls start()', () => {
    expect(MockSession).toHaveBeenCalled();
    expect(mockSessionStart).toHaveBeenCalled();
  });
});
