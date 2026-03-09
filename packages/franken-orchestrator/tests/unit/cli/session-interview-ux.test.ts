import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

let currentDesignDoc = '';
let revisedDesignDoc = '';
let capturedInterviewLlm: unknown = undefined;
let capturedProgressInner: unknown = undefined;
const planBuilds: Array<{ goal: string }> = [];

const mockCliLlmAdapter = {
  transformRequest: vi.fn((request: unknown) => request),
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

const mockAdapterComplete = vi.fn(async (prompt: string) => {
  if (prompt.includes('Revise this design document based on the following feedback:')) {
    return revisedDesignDoc;
  }
  return currentDesignDoc;
});

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: vi.fn(async () => ({
    deps: {},
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      getLogEntries: vi.fn(() => []),
    },
    finalize: vi.fn(async () => {}),
    cliLlmAdapter: mockCliLlmAdapter,
  })),
}));

vi.mock('../../../src/adapters/adapter-llm-client.js', () => ({
  AdapterLlmClient: vi.fn().mockImplementation(function MockAdapterLlmClient(this: { complete: typeof mockAdapterComplete }) {
    this.complete = mockAdapterComplete;
  }),
}));

vi.mock('../../../src/adapters/progress-llm-client.js', () => ({
  ProgressLlmClient: class ProgressLlmClient {
    constructor(private readonly inner: { complete(prompt: string): Promise<string> }) {
      capturedProgressInner = inner;
    }

    async complete(prompt: string): Promise<string> {
      return this.inner.complete(prompt);
    }
  },
}));

vi.mock('../../../src/planning/interview-loop.js', () => ({
  InterviewLoop: vi.fn().mockImplementation(function MockInterviewLoop(
    this: { build(intent: { goal: string }): Promise<{ tasks: never[] }> },
    llm: unknown,
    _io: InterviewIO,
    graphBuilder: { build(intent: { goal: string }): Promise<{ tasks: never[] }> },
  ) {
    capturedInterviewLlm = llm;
    this.build = async () => {
      await graphBuilder.build({ goal: currentDesignDoc });
      return { tasks: [] };
    };
  }),
}));

vi.mock('../../../src/planning/llm-graph-builder.js', () => ({
  LlmGraphBuilder: vi.fn().mockImplementation(function MockLlmGraphBuilder(
    this: { build(intent: { goal: string }): Promise<{ tasks: never[] }>; lastChunks: unknown[] },
  ) {
    this.lastChunks = [];
    this.build = async (intent) => {
      planBuilds.push(intent);
      return { tasks: [] };
    };
  }),
}));

vi.mock('../../../src/cli/review-loop.js', () => ({
  reviewLoop: vi.fn(async () => {}),
}));

function createIO(answers: string[]): InterviewIO {
  let index = 0;
  return {
    ask: vi.fn(async () => answers[index++] ?? 'c'),
    display: vi.fn(),
  };
}

function createConfig(
  paths: ProjectPaths,
  io: InterviewIO,
  overrides: Partial<import('../../../src/cli/session.js').SessionConfig> = {},
): import('../../../src/cli/session.js').SessionConfig {
  return {
    paths,
    baseBranch: 'main',
    budget: 10,
    provider: 'claude',
    noPr: true,
    verbose: false,
    reset: false,
    io,
    entryPhase: 'interview',
    ...overrides,
  };
}

describe('Session interview UX', () => {
  let testDir: string;
  let paths: ProjectPaths;
  const originalLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    currentDesignDoc = [
      '# Add Audit Trail',
      '',
      'Capture audit records for admin actions.',
      '',
      '## Implementation',
      '',
      '- Add audit writer',
      '- Persist actor and timestamp',
    ].join('\n');
    revisedDesignDoc = [
      '# Add Audit Trail',
      '',
      'Capture audit records and include rollback handling.',
      '',
      '## Implementation',
      '',
      '- Add audit writer',
      '- Persist actor and timestamp',
      '- Add rollback handling',
    ].join('\n');
    capturedInterviewLlm = undefined;
    capturedProgressInner = undefined;
    planBuilds.length = 0;

    testDir = resolve(
      tmpdir(),
      `fb-session-interview-ux-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    paths = getProjectPaths(testDir);
    scaffoldFrankenbeast(paths);
    console.log = vi.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('wraps AdapterLlmClient with ProgressLlmClient and shows a summary card', async () => {
    const io = createIO(['x']);
    const { Session } = await import('../../../src/cli/session.js');

    await new Session(createConfig(paths, io, { exitAfter: 'interview' })).start();

    expect(capturedProgressInner).toBeDefined();
    expect(capturedInterviewLlm).toBeDefined();
    expect((capturedInterviewLlm as { constructor: { name: string } }).constructor.name).toBe(
      'ProgressLlmClient',
    );

    expect(io.display).toHaveBeenCalledWith(
      expect.stringContaining('Design Document'),
    );
    expect(io.display).toHaveBeenCalledWith(
      expect.stringContaining(paths.designDocFile),
    );
    expect(io.display).not.toHaveBeenCalledWith(
      expect.stringContaining('## Implementation'),
    );
    expect(readFileSync(paths.designDocFile, 'utf-8')).toBe(currentDesignDoc);
  });

  it('uses the no-op prompt header and exits before planning on [x]', async () => {
    currentDesignDoc = '# Already Done\n\nNo changes needed.';
    const io = createIO(['x']);
    const { Session } = await import('../../../src/cli/session.js');

    const result = await new Session(createConfig(paths, io)).start();

    expect(result).toBeUndefined();
    expect(planBuilds).toHaveLength(0);
    expect(io.ask).toHaveBeenCalledWith(
      expect.stringContaining('no implementation changes needed'),
    );
  });

  it('continues into planning on [c]', async () => {
    const io = createIO(['c']);
    const { Session } = await import('../../../src/cli/session.js');

    const result = await new Session(
      createConfig(paths, io, { exitAfter: 'plan' }),
    ).start();

    expect(result).toBeUndefined();
    expect(planBuilds).toEqual([{ goal: currentDesignDoc }]);
    expect(io.ask).toHaveBeenCalledWith(
      expect.stringContaining('[c] Continue to planning phase'),
    );
  });

  it('revises, rewrites the design doc, redisplays the card, and then continues', async () => {
    const io = createIO(['r', 'Add rollback coverage', 'c']);
    const { Session } = await import('../../../src/cli/session.js');

    await new Session(createConfig(paths, io, { exitAfter: 'plan' })).start();

    expect(mockAdapterComplete).toHaveBeenCalledWith(
      expect.stringContaining('Feedback: Add rollback coverage'),
    );
    expect(mockAdapterComplete).toHaveBeenCalledWith(
      expect.stringContaining(`Current document:\n${currentDesignDoc}`),
    );
    expect(readFileSync(paths.designDocFile, 'utf-8')).toBe(revisedDesignDoc);
    expect(io.display).toHaveBeenCalledTimes(2);
    expect((io.display as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]).toContain(
      'rollback handling',
    );
    expect(planBuilds).toEqual([{ goal: revisedDesignDoc }]);
  });

  it('re-prompts on unrecognized input', async () => {
    const io = createIO(['maybe', 'c']);
    const { Session } = await import('../../../src/cli/session.js');

    await new Session(createConfig(paths, io, { exitAfter: 'interview' })).start();

    expect(io.display).toHaveBeenCalledWith('Please enter c, r, or x.');
    expect(io.ask).toHaveBeenCalledTimes(2);
  });
});
