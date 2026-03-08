import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MartinLoopConfig, IterationResult, CliSkillConfig, GitIsolationConfig } from '../../../src/skills/cli-types.js';
import type { SkillInput, ICheckpointStore } from '../../../src/deps.js';
import { makeLogger } from '../../helpers/stubs.js';

// ── Factories ──

function makeSkillInput(overrides?: Partial<SkillInput>): SkillInput {
  return {
    objective: 'Test objective',
    context: { adrs: [], knownErrors: [], rules: [] },
    dependencyOutputs: new Map(),
    sessionId: 'session-1',
    projectId: 'project-1',
    ...overrides,
  };
}

function makeMartinConfig(overrides?: Partial<MartinLoopConfig>): MartinLoopConfig {
  return {
    prompt: 'Implement the feature',
    promiseTag: 'IMPL_01_DONE',
    maxIterations: 5,
    maxTurns: 10,
    provider: 'claude',
    claudeCmd: 'claude',
    codexCmd: 'codex',
    timeoutMs: 60000,
    ...overrides,
  };
}

function makeGitConfig(overrides?: Partial<GitIsolationConfig>): GitIsolationConfig {
  return {
    baseBranch: 'main',
    branchPrefix: 'feat/',
    autoCommit: true,
    workingDir: '/fake/repo',
    ...overrides,
  };
}

function makeCliConfig(overrides?: {
  martin?: Partial<MartinLoopConfig>;
  git?: Partial<GitIsolationConfig>;
  budgetLimitUsd?: number;
}): CliSkillConfig {
  return {
    martin: makeMartinConfig(overrides?.martin),
    git: makeGitConfig(overrides?.git),
    budgetLimitUsd: overrides?.budgetLimitUsd,
  };
}

function makeIterResult(overrides?: Partial<IterationResult>): IterationResult {
  return {
    iteration: 1,
    exitCode: 0,
    stdout: 'test output',
    stderr: '',
    durationMs: 1000,
    rateLimited: false,
    promiseDetected: false,
    tokensEstimated: 100,
    ...overrides,
  };
}

function makeMockMartin() {
  return {
    run: vi.fn().mockResolvedValue({
      completed: true,
      iterations: 1,
      output: 'completed output',
      tokensUsed: 100,
    }),
  };
}

function makeMockGit() {
  return {
    isolate: vi.fn(),
    merge: vi.fn().mockReturnValue({ merged: true, commits: 3 }),
    autoCommit: vi.fn(),
    hasMeaningfulChange: vi.fn(),
    getCurrentHead: vi.fn(),
    getDiffStat: vi.fn().mockReturnValue('src/foo.ts | 10 +++\n'),
    getWorkingDir: vi.fn().mockReturnValue('/tmp/test-repo'),
    getStatus: vi.fn().mockReturnValue(''),
    resetHard: vi.fn(),
    getConflictedFiles: vi.fn().mockReturnValue([]),
    getConflictDiff: vi.fn().mockReturnValue(''),
    completeMerge: vi.fn(),
    abortMerge: vi.fn(),
  };
}

function makeMockObserver() {
  let spanCount = 0;
  return {
    trace: { id: 'trace-1' },
    counter: {
      grandTotal: vi.fn().mockReturnValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      allModels: vi.fn().mockReturnValue([] as string[]),
      totalsFor: vi.fn().mockReturnValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    },
    costCalc: {
      totalCost: vi.fn().mockReturnValue(0),
    },
    breaker: {
      check: vi.fn().mockReturnValue({ tripped: false, limitUsd: 10, spendUsd: 0 }),
    },
    loopDetector: {
      check: vi.fn().mockReturnValue({ detected: false }),
    },
    startSpan: vi.fn().mockImplementation(() => ({ id: `span-${spanCount++}` })),
    endSpan: vi.fn(),
    recordTokenUsage: vi.fn(),
    setMetadata: vi.fn(),
  };
}

function makeCheckpoint(overrides: Partial<ICheckpointStore> = {}): ICheckpointStore {
  const store = new Set<string>();
  return {
    has: vi.fn((key: string) => store.has(key)),
    write: vi.fn((key: string) => { store.add(key); }),
    readAll: vi.fn(() => new Set(store)),
    clear: vi.fn(() => { store.clear(); }),
    recordCommit: vi.fn(),
    lastCommit: vi.fn(() => undefined),
    ...overrides,
  };
}

// ── Tests ──

describe('CliSkillExecutor', () => {
  let martin: ReturnType<typeof makeMockMartin>;
  let git: ReturnType<typeof makeMockGit>;
  let observer: ReturnType<typeof makeMockObserver>;

  beforeEach(() => {
    martin = makeMockMartin();
    git = makeMockGit();
    observer = makeMockObserver();
  });

  async function createAndExecute(
    skillId = 'cli:01_types',
    input = makeSkillInput(),
    config = makeCliConfig(),
    checkpoint?: ICheckpointStore,
    taskId?: string,
  ) {
    const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(martin as any, git as any, observer);
    return executor.execute(skillId, input, config, checkpoint, taskId);
  }

  describe('successful execution (promise detected)', () => {
    it('returns SkillResult with output and tokensUsed', async () => {
      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ promiseDetected: true, tokensEstimated: 250 }));
        return { completed: true, iterations: 1, output: '<promise>IMPL_01_DONE</promise>', tokensUsed: 250 };
      });
      observer.counter.grandTotal
        .mockReturnValueOnce({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
        .mockReturnValue({ promptTokens: 50, completionTokens: 250, totalTokens: 300 });

      const result = await createAndExecute();

      expect(result.output).toBe('<promise>IMPL_01_DONE</promise>');
      expect(result.tokensUsed).toBe(300);
    });

    it('uses executor-level provider defaults when execution passes no martin config', async () => {
      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(
        martin as any,
        git as any,
        observer,
        undefined,
        undefined,
        undefined,
        {
          provider: 'codex',
          providers: ['codex'],
          command: '/usr/local/bin/codex',
        },
      );

      await executor.execute('cli:01_types', makeSkillInput(), {} as never);

      expect(martin.run).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'codex',
        providers: ['codex'],
        command: '/usr/local/bin/codex',
      }));
    });
  });

  describe('failed execution (max iterations)', () => {
    it('throws when martin loop does not complete', async () => {
      martin.run.mockResolvedValue({
        completed: false,
        iterations: 5,
        output: 'partial output',
        tokensUsed: 500,
      });

      await expect(createAndExecute()).rejects.toThrow(
        /MartinLoop did not complete.*after 5 iterations.*no promise tag detected/,
      );
    });
  });

  describe('budget exceeded mid-loop', () => {
    it('stops loop early and returns partial result', async () => {
      observer.breaker.check
        .mockReturnValueOnce({ tripped: false, limitUsd: 10, spendUsd: 0 })
        .mockReturnValue({ tripped: true, limitUsd: 10, spendUsd: 11 });

      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ tokensEstimated: 5000 }));
        // BudgetExceededError thrown in onIteration — this line should not be reached
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 5000 };
      });

      const result = await createAndExecute();

      expect(result.output).toContain('Budget exceeded');
      expect(git.merge).not.toHaveBeenCalled();
      expect(observer.endSpan).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ errorMessage: 'budget-exceeded' }),
      );
    });
  });

  describe('observer span creation per iteration', () => {
    it('creates a span for each iteration via onIteration callback', async () => {
      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1 }));
        config.onIteration?.(2, makeIterResult({ iteration: 2 }));
        config.onIteration?.(3, makeIterResult({ iteration: 3, promiseDetected: true }));
        return { completed: true, iterations: 3, output: 'done', tokensUsed: 300 };
      });

      await createAndExecute();

      // 1 chunk span + 3 iteration spans = 4 startSpan calls
      expect(observer.startSpan).toHaveBeenCalledTimes(4);
      expect(observer.startSpan).toHaveBeenCalledWith(
        observer.trace,
        expect.objectContaining({ name: 'cli:01_types:iter-1' }),
      );
      expect(observer.startSpan).toHaveBeenCalledWith(
        observer.trace,
        expect.objectContaining({ name: 'cli:01_types:iter-2' }),
      );
      expect(observer.startSpan).toHaveBeenCalledWith(
        observer.trace,
        expect.objectContaining({ name: 'cli:01_types:iter-3' }),
      );
    });
  });

  describe('token recording per iteration', () => {
    it('calls recordTokenUsage for each iteration', async () => {
      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1, tokensEstimated: 100 }));
        config.onIteration?.(2, makeIterResult({ iteration: 2, tokensEstimated: 200 }));
        return { completed: true, iterations: 2, output: 'done', tokensUsed: 300 };
      });

      await createAndExecute();

      expect(observer.recordTokenUsage).toHaveBeenCalledTimes(2);
      expect(observer.recordTokenUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ completionTokens: 100 }),
        observer.counter,
      );
      expect(observer.recordTokenUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ completionTokens: 200 }),
        observer.counter,
      );
    });
  });

  describe('git branch isolation lifecycle', () => {
    it('calls git.isolate before martin.run and git.merge after', async () => {
      const callOrder: string[] = [];

      git.isolate.mockImplementation(() => { callOrder.push('isolate'); });
      martin.run.mockImplementation(async () => {
        callOrder.push('martin.run');
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 100 };
      });
      git.merge.mockImplementation(() => {
        callOrder.push('merge');
        return { merged: true, commits: 1 };
      });

      await createAndExecute();

      expect(callOrder).toEqual(['isolate', 'martin.run', 'merge']);
    });

    it('extracts chunkId from skillId for git operations', async () => {
      await createAndExecute('cli:03_git_branch_isolator');

      expect(git.isolate).toHaveBeenCalledWith('03_git_branch_isolator');
      expect(git.merge).toHaveBeenCalledWith('03_git_branch_isolator');
    });
  });

  describe('error propagation from MartinLoop', () => {
    it('wraps MartinLoop errors with chunk context', async () => {
      martin.run.mockRejectedValue(new Error('spawn ENOENT'));

      await expect(createAndExecute()).rejects.toThrow(/MartinLoop.*01_types.*spawn ENOENT/);
    });
  });

  describe('error propagation from GitBranchIsolator', () => {
    it('wraps git.isolate errors with chunk context', async () => {
      git.isolate.mockImplementation(() => { throw new Error('branch already exists'); });

      await expect(createAndExecute()).rejects.toThrow(/Git isolation.*01_types.*branch already exists/);
    });
  });

  describe('merge conflict handling', () => {
    it('returns SkillResult with output even when git.merge throws', async () => {
      git.merge.mockImplementation(() => { throw new Error('merge conflict in file.ts'); });

      const result = await createAndExecute();

      expect(result.output).toBe('completed output');
      expect(result.tokensUsed).toBeDefined();
      expect(observer.setMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ mergeError: expect.stringContaining('merge conflict') }),
      );
    });

    it('spawns MartinLoop to resolve conflicts when merge returns conflicted', async () => {
      git.merge.mockReturnValue({
        merged: false, commits: 2, conflicted: true,
        conflictFiles: ['docs/ARCHITECTURE.md'],
      });
      git.getConflictDiff.mockReturnValue('<<<<<<< HEAD\nMartin\n=======\nRalph\n>>>>>>> feat/06');
      // After LLM resolution, conflicts are gone
      git.getConflictedFiles.mockReturnValue([]);

      // Second martin.run call (conflict resolution) succeeds
      martin.run
        .mockResolvedValueOnce({ completed: true, iterations: 1, output: 'impl done', tokensUsed: 100 })
        .mockResolvedValueOnce({ completed: true, iterations: 1, output: 'resolved', tokensUsed: 50 });

      const result = await createAndExecute();

      // Should have called martin.run twice (impl + conflict resolution)
      expect(martin.run).toHaveBeenCalledTimes(2);
      // Second call should have a conflict resolution prompt
      const resolveConfig = martin.run.mock.calls[1]![0] as MartinLoopConfig;
      expect(resolveConfig.prompt).toContain('merge conflict');
      expect(resolveConfig.prompt).toContain('docs/ARCHITECTURE.md');
      expect(resolveConfig.maxIterations).toBeLessThanOrEqual(3);
      // Should complete the merge after resolution
      expect(git.completeMerge).toHaveBeenCalled();
      expect(git.abortMerge).not.toHaveBeenCalled();
      expect(result.output).toBe('impl done');
    });

    it('aborts merge when LLM fails to resolve conflicts', async () => {
      git.merge.mockReturnValue({
        merged: false, commits: 2, conflicted: true,
        conflictFiles: ['docs/ARCHITECTURE.md'],
      });
      git.getConflictDiff.mockReturnValue('<<<<<<< HEAD\nfoo\n=======\nbar\n>>>>>>>');
      // After LLM resolution attempt, conflicts remain
      git.getConflictedFiles.mockReturnValue(['docs/ARCHITECTURE.md']);

      martin.run
        .mockResolvedValueOnce({ completed: true, iterations: 1, output: 'impl done', tokensUsed: 100 })
        .mockResolvedValueOnce({ completed: false, iterations: 2, output: 'gave up', tokensUsed: 50 });

      const result = await createAndExecute();

      // Should abort the merge since conflicts remain
      expect(git.abortMerge).toHaveBeenCalled();
      expect(git.completeMerge).not.toHaveBeenCalled();
      // Should still return SkillResult (not throw)
      expect(result.output).toBe('impl done');
    });

    it('aborts merge when conflict resolution MartinLoop throws', async () => {
      git.merge.mockReturnValue({
        merged: false, commits: 2, conflicted: true,
        conflictFiles: ['file.ts'],
      });
      git.getConflictDiff.mockReturnValue('conflict diff');
      git.getConflictedFiles.mockReturnValue(['file.ts']);

      martin.run
        .mockResolvedValueOnce({ completed: true, iterations: 1, output: 'impl done', tokensUsed: 100 })
        .mockRejectedValueOnce(new Error('spawn failed'));

      const result = await createAndExecute();

      expect(git.abortMerge).toHaveBeenCalled();
      expect(result.output).toBe('impl done');
    });
  });

  describe('config validation', () => {
    it('rejects empty skillId', async () => {
      await expect(createAndExecute('')).rejects.toThrow(/skillId/i);
    });

    it('uses full skillId as chunkId when no colon present', async () => {
      await createAndExecute('01_types');

      expect(git.isolate).toHaveBeenCalledWith('01_types');
      expect(git.merge).toHaveBeenCalledWith('01_types');
    });
  });

  describe('budget exceeded before loop starts', () => {
    it('returns immediately without calling martin.run or git.isolate', async () => {
      observer.breaker.check.mockReturnValue({ tripped: true, limitUsd: 10, spendUsd: 12 });

      const result = await createAndExecute();

      expect(git.isolate).not.toHaveBeenCalled();
      expect(martin.run).not.toHaveBeenCalled();
      expect(result.output).toContain('Budget exceeded');
      expect(result.tokensUsed).toBe(0);
    });
  });

  describe('commit message generation before merge', () => {
    it('calls commitMessageFn before merge and passes result to merge()', async () => {
      const commitMessageFn = vi.fn().mockResolvedValue('feat(types): add shared type definitions');

      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(martin as any, git as any, observer, undefined, commitMessageFn);
      await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

      expect(git.getDiffStat).toHaveBeenCalledWith('01_types');
      expect(commitMessageFn).toHaveBeenCalledWith('src/foo.ts | 10 +++\n', 'Test objective');
      expect(git.merge).toHaveBeenCalledWith('01_types', 'feat(types): add shared type definitions');
    });

    it('passes undefined to merge when commitMessageFn is not provided', async () => {
      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(martin as any, git as any, observer);
      await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

      expect(git.merge).toHaveBeenCalledWith('01_types');
    });

    it('passes undefined to merge when commitMessageFn returns null', async () => {
      const commitMessageFn = vi.fn().mockResolvedValue(null);

      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(martin as any, git as any, observer, undefined, commitMessageFn);
      await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

      expect(git.merge).toHaveBeenCalledWith('01_types');
    });

    it('falls back to no message when commitMessageFn throws', async () => {
      const commitMessageFn = vi.fn().mockRejectedValue(new Error('LLM down'));

      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(martin as any, git as any, observer, undefined, commitMessageFn);
      await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

      // Should still merge, just without a message
      expect(git.merge).toHaveBeenCalledWith('01_types');
    });
  });

  describe('progress logging', () => {
    it('logs rate limit sleep metadata via logger callback wiring', async () => {
      const logger = makeLogger();
      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onSleep?.(30_000, 'retry-after header');
        config.onIteration?.(1, makeIterResult({ iteration: 1, rateLimited: true, sleepMs: 30_000 }));
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 100 };
      });

      const { CliSkillExecutor } = await import('../../../src/skills/cli-skill-executor.js');
      const executor = new CliSkillExecutor(martin as any, git as any, observer, undefined, undefined, logger);
      await executor.execute('cli:01_types', makeSkillInput(), makeCliConfig());

      expect(logger.warn).toHaveBeenCalledWith(
        'MartinLoop: sleeping for rate limit reset',
        expect.objectContaining({ chunkId: '01_types', durationMs: 30_000 }),
        'martin',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'MartinLoop: iteration complete',
        expect.objectContaining({ chunkId: '01_types', iteration: 1, rateLimited: true }),
        'martin',
      );
    });
  });

  describe('per-commit checkpoint recording', () => {
    it('calls checkpoint.recordCommit after auto-commit in onIteration', async () => {
      const checkpoint = makeCheckpoint();
      git.autoCommit.mockReturnValue(true);
      git.getCurrentHead.mockReturnValue('abc123');

      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1 }));
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 100 };
      });

      await createAndExecute('cli:01_types', makeSkillInput(), makeCliConfig(), checkpoint, 'task-1');

      expect(git.autoCommit).toHaveBeenCalledWith('01_types', 'impl', 1);
      expect(checkpoint.recordCommit).toHaveBeenCalledWith('task-1', 'impl', 1, 'abc123');
    });

    it('does not call recordCommit when auto-commit returns false (nothing to commit)', async () => {
      const checkpoint = makeCheckpoint();
      git.autoCommit.mockReturnValue(false);

      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1 }));
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 100 };
      });

      await createAndExecute('cli:01_types', makeSkillInput(), makeCliConfig(), checkpoint, 'task-1');

      expect(git.autoCommit).toHaveBeenCalled();
      expect(checkpoint.recordCommit).not.toHaveBeenCalled();
    });

    it('works without checkpoint (backward compatible)', async () => {
      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1 }));
        return { completed: true, iterations: 1, output: 'done', tokensUsed: 100 };
      });

      // No checkpoint passed — should not throw
      const result = await createAndExecute();

      expect(result.output).toBe('done');
    });

    it('records multiple commits across iterations', async () => {
      const checkpoint = makeCheckpoint();
      let commitCount = 0;
      git.autoCommit.mockReturnValue(true);
      git.getCurrentHead.mockImplementation(() => `hash_${++commitCount}`);

      martin.run.mockImplementation(async (config: MartinLoopConfig) => {
        config.onIteration?.(1, makeIterResult({ iteration: 1 }));
        config.onIteration?.(2, makeIterResult({ iteration: 2 }));
        config.onIteration?.(3, makeIterResult({ iteration: 3 }));
        return { completed: true, iterations: 3, output: 'done', tokensUsed: 300 };
      });

      await createAndExecute('cli:01_types', makeSkillInput(), makeCliConfig(), checkpoint, 'task-1');

      expect(checkpoint.recordCommit).toHaveBeenCalledTimes(3);
      expect(checkpoint.recordCommit).toHaveBeenCalledWith('task-1', 'impl', 1, 'hash_1');
      expect(checkpoint.recordCommit).toHaveBeenCalledWith('task-1', 'impl', 2, 'hash_2');
      expect(checkpoint.recordCommit).toHaveBeenCalledWith('task-1', 'impl', 3, 'hash_3');
    });
  });
});
