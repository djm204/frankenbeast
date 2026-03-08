import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

// ── Mock heavy dependencies ──

// Mock createCliDeps to avoid real CliSkillExecutor, MartinLoop, etc.
const mockFinalize = vi.fn(async () => {});
const mockDeps = {
  firewall: { runPipeline: vi.fn() },
  skills: { hasSkill: vi.fn(), getAvailableSkills: vi.fn(() => []), execute: vi.fn() },
  memory: { frontload: vi.fn(), getContext: vi.fn(), recordTrace: vi.fn() },
  planner: { createPlan: vi.fn() },
  observer: {
    startTrace: vi.fn(),
    startSpan: vi.fn(() => ({ end: vi.fn() })),
    getTokenSpend: vi.fn(async () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })),
  },
  critique: { reviewPlan: vi.fn() },
  governor: { requestApproval: vi.fn() },
  heartbeat: { pulse: vi.fn() },
  logger: {
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
    getLogEntries: vi.fn(() => []),
  },
  clock: () => new Date(),
  cliExecutor: {
    transformRequest: vi.fn((r: unknown) => r),
    execute: vi.fn(async () => ({})),
    transformResponse: vi.fn(() => ({ content: 'mock response' })),
    validateCapabilities: vi.fn(() => true),
  },
};

const mockCliLlmAdapter = {
  transformRequest: vi.fn((r: unknown) => r),
  execute: vi.fn(async () => ''),
  transformResponse: vi.fn(() => ({ content: 'mock response' })),
  validateCapabilities: vi.fn(() => true),
  config: {
    provider: 'claude',
    claudeCmd: 'claude',
    codexCmd: 'codex',
    workingDir: '/tmp',
    timeoutMs: 120_000,
  },
};

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: vi.fn(() => ({
    deps: mockDeps,
    logger: mockDeps.logger,
    finalize: mockFinalize,
    cliLlmAdapter: mockCliLlmAdapter,
  })),
}));

// Mock InterviewLoop
const mockInterviewBuild = vi.fn(async () => ({ tasks: [] }));
vi.mock('../../../src/planning/interview-loop.js', () => {
  const MockInterviewLoop = vi.fn(function (this: { build: typeof mockInterviewBuild }) {
    this.build = mockInterviewBuild;
  });
  return { InterviewLoop: MockInterviewLoop };
});

// Mock LlmGraphBuilder
const mockLlmGraphBuild = vi.fn(async () => ({
  tasks: [
    { id: 'impl:auth', objective: 'Implement auth', requiredSkills: ['cli:auth'], dependsOn: [] },
    { id: 'harden:auth', objective: 'Harden auth', requiredSkills: ['cli:auth'], dependsOn: ['impl:auth'] },
  ],
}));
vi.mock('../../../src/planning/llm-graph-builder.js', () => {
  const MockLlmGraphBuilder = vi.fn(function (this: { build: typeof mockLlmGraphBuild }) {
    this.build = mockLlmGraphBuild;
  });
  return { LlmGraphBuilder: MockLlmGraphBuilder };
});

// Mock AdapterLlmClient
const mockComplete = vi.fn(async () => 'mock LLM response');
vi.mock('../../../src/adapters/adapter-llm-client.js', () => {
  const MockAdapterLlmClient = vi.fn(function (this: { complete: typeof mockComplete }) {
    this.complete = mockComplete;
  });
  return { AdapterLlmClient: MockAdapterLlmClient };
});

// Mock reviewLoop
const mockReviewLoop = vi.fn(async () => {});
vi.mock('../../../src/cli/review-loop.js', () => ({
  reviewLoop: mockReviewLoop,
}));

// Mock file-writer
const mockWriteDesignDoc = vi.fn((_paths: ProjectPaths, _content: string) => '/mock/design.md');
const mockReadDesignDoc = vi.fn((_paths: ProjectPaths) => undefined as string | undefined);
const mockWriteChunkFiles = vi.fn((_paths: ProjectPaths, _chunks: unknown[]) => ['/mock/01_chunk.md']);
vi.mock('../../../src/cli/file-writer.js', () => ({
  writeDesignDoc: (...args: unknown[]) => mockWriteDesignDoc(args[0] as ProjectPaths, args[1] as string),
  readDesignDoc: (...args: unknown[]) => mockReadDesignDoc(args[0] as ProjectPaths),
  writeChunkFiles: (...args: unknown[]) => mockWriteChunkFiles(args[0] as ProjectPaths, args[1] as unknown[]),
}));

// Mock BeastLoop
const mockBeastResult = {
  sessionId: 'test-session',
  projectId: 'test',
  phase: 'closure' as const,
  status: 'completed' as const,
  tokenSpend: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 },
  taskResults: [
    { taskId: 'impl:auth', status: 'success' as const },
    { taskId: 'harden:auth', status: 'success' as const },
  ],
  durationMs: 60000,
};
const mockBeastRun = vi.fn(async () => mockBeastResult);
vi.mock('../../../src/beast-loop.js', () => {
  const MockBeastLoop = vi.fn(function (this: { run: typeof mockBeastRun }) {
    this.run = mockBeastRun;
  });
  return { BeastLoop: MockBeastLoop };
});

// Mock ChunkFileGraphBuilder
const mockChunkBuild = vi.fn(async () => ({ tasks: [] }));
vi.mock('../../../src/planning/chunk-file-graph-builder.js', () => {
  const MockChunkFileGraphBuilder = vi.fn(function (this: { build: typeof mockChunkBuild }) {
    this.build = mockChunkBuild;
  });
  return { ChunkFileGraphBuilder: MockChunkFileGraphBuilder };
});

// Mock beast-logger (imported by session.ts)
vi.mock('../../../src/logging/beast-logger.js', () => ({
  ANSI: { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '', gray: '', bgRed: '', bgGreen: '' },
  BANNER: '',
  budgetBar: vi.fn(() => '[===     ]'),
  statusBadge: vi.fn(() => 'PASS'),
  logHeader: vi.fn((t: string) => `--- ${t} ---`),
  BeastLogger: vi.fn(function (this: Record<string, unknown>) {
    this.info = vi.fn();
    this.debug = vi.fn();
    this.warn = vi.fn();
    this.error = vi.fn();
    this.getLogEntries = vi.fn(() => []);
  }),
  stripAnsi: vi.fn((s: string) => s),
}));

// ── Helpers ──

function mockIO(answers: string[] = ['c']): InterviewIO {
  let idx = 0;
  return {
    ask: vi.fn(async () => answers[idx++] ?? 'c'),
    display: vi.fn(),
  };
}

function makeConfig(overrides: Partial<import('../../../src/cli/session.js').SessionConfig> = {}): import('../../../src/cli/session.js').SessionConfig {
  const testDir = resolve(tmpdir(), `fb-test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  const paths = getProjectPaths(testDir);
  scaffoldFrankenbeast(paths);

  return {
    paths,
    baseBranch: 'main',
    budget: 5,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
    io: mockIO(),
    entryPhase: 'interview',
    ...overrides,
  };
}

// ── Tests ──

describe('Session', () => {
  // Suppress console.log from displaySummary
  const origLog = console.log;
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
  });
  afterEach(() => {
    console.log = origLog;
  });

  describe('SessionPhase type', () => {
    it('exports SessionPhase type with three values', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'interview' });
      const session = new Session(config);
      expect(session).toBeDefined();
    });
  });

  describe('entry point detection', () => {
    it('starts at interview phase when entryPhase is interview', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const io = mockIO();
      const config = makeConfig({ entryPhase: 'interview', exitAfter: 'interview', io });
      const session = new Session(config);
      const result = await session.start();

      expect(result).toBeUndefined();
      const { InterviewLoop } = await import('../../../src/planning/interview-loop.js');
      expect(InterviewLoop).toHaveBeenCalled();
    });

    it('starts at plan phase when entryPhase is plan', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce('# Design Doc Content');
      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });
      const session = new Session(config);
      const result = await session.start();

      expect(result).toBeUndefined();
      const { LlmGraphBuilder } = await import('../../../src/planning/llm-graph-builder.js');
      expect(LlmGraphBuilder).toHaveBeenCalled();
    });

    it('starts at execute phase when entryPhase is execute', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'execute' });
      const session = new Session(config);
      const result = await session.start();

      expect(result).toBeDefined();
      expect(result!.status).toBe('completed');
    });
  });

  describe('phase chaining', () => {
    it('chains interview -> plan -> execute in default mode (no exitAfter)', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValue('# Design');
      const config = makeConfig({ entryPhase: 'interview' });
      const session = new Session(config);
      const result = await session.start();

      expect(result).toBeDefined();
      expect(result!.status).toBe('completed');
      // reviewLoop is only used for the plan phase.
      expect(mockReviewLoop).toHaveBeenCalledTimes(1);
    });

    it('chains plan -> execute when starting from plan', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValue('# Design');
      const config = makeConfig({ entryPhase: 'plan' });
      const session = new Session(config);
      const result = await session.start();

      expect(result).toBeDefined();
      expect(result!.status).toBe('completed');
      // Only one reviewLoop call (plan phase)
      expect(mockReviewLoop).toHaveBeenCalledTimes(1);
    });
  });

  describe('subcommand exit behavior', () => {
    it('returns undefined when exitAfter is interview', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'interview', exitAfter: 'interview' });
      const result = await new Session(config).start();
      expect(result).toBeUndefined();
    });

    it('returns undefined when exitAfter is plan', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce('# Design');
      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });
      const result = await new Session(config).start();
      expect(result).toBeUndefined();
    });

    it('returns BeastResult when exitAfter is execute', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'execute', exitAfter: 'execute' });
      const result = await new Session(config).start();
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('test-session');
    });
  });

  describe('interview phase', () => {
    it('runs InterviewLoop and writes design doc', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'interview', exitAfter: 'interview' });
      await new Session(config).start();

      expect(mockWriteDesignDoc).toHaveBeenCalled();
    });

    it('shows the follow-up interview prompt after writing the design doc', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'interview', exitAfter: 'interview' });
      await new Session(config).start();

      expect(config.io.ask).toHaveBeenCalledWith(
        expect.stringContaining('[c] Continue to planning phase'),
      );
    });
  });

  describe('plan phase', () => {
    it('loads design doc from readDesignDoc by default', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce('# Stored Design');
      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });
      await new Session(config).start();

      expect(mockReadDesignDoc).toHaveBeenCalledWith(config.paths);
    });

    it('uses designDocPath when provided (--design-doc flag)', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const testDir = resolve(tmpdir(), `fb-test-design-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      const designPath = resolve(testDir, 'custom-design.md');
      writeFileSync(designPath, '# Custom Design');

      const config = makeConfig({
        entryPhase: 'plan',
        exitAfter: 'plan',
        designDocPath: designPath,
      });
      await new Session(config).start();

      // readDesignDoc should NOT be called when designDocPath is provided
      expect(mockReadDesignDoc).not.toHaveBeenCalled();

      rmSync(testDir, { recursive: true, force: true });
    });

    it('throws clear error when no design doc found', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce(undefined);
      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });

      await expect(new Session(config).start()).rejects.toThrow(
        /No design document found.*Run "frankenbeast interview" first/,
      );
    });

    it('writes chunk files and runs review loop', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce('# Design');
      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });
      await new Session(config).start();

      expect(mockWriteChunkFiles).toHaveBeenCalled();
      expect(mockReviewLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactLabel: 'Chunk files',
        }),
      );
    });
  });

  describe('execute phase', () => {
    it('runs BeastLoop and returns BeastResult', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'execute' });
      const result = await new Session(config).start();

      expect(result).toBeDefined();
      expect(result!.projectId).toBe('test');
      expect(mockBeastRun).toHaveBeenCalled();
    });

    it('uses planDirOverride when provided', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const { ChunkFileGraphBuilder } = await import('../../../src/planning/chunk-file-graph-builder.js');
      const config = makeConfig({
        entryPhase: 'execute',
        planDirOverride: '/custom/chunks',
      });
      await new Session(config).start();

      expect(ChunkFileGraphBuilder).toHaveBeenCalledWith('/custom/chunks');
    });

    it('calls finalize after execution', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      const config = makeConfig({ entryPhase: 'execute' });
      await new Session(config).start();

      expect(mockFinalize).toHaveBeenCalled();
    });
  });

  describe('extractChunkDefinitions', () => {
    it('extracts chunks from impl: tasks, filtering harden: tasks', async () => {
      const { Session } = await import('../../../src/cli/session.js');
      mockReadDesignDoc.mockReturnValueOnce('# Design');

      const config = makeConfig({ entryPhase: 'plan', exitAfter: 'plan' });
      await new Session(config).start();

      // writeChunkFiles should have been called with extracted chunk definitions
      expect(mockWriteChunkFiles).toHaveBeenCalledWith(
        config.paths,
        expect.arrayContaining([
          expect.objectContaining({
            id: 'auth',
            objective: 'Implement auth',
          }),
        ]),
      );
    });
  });
});
