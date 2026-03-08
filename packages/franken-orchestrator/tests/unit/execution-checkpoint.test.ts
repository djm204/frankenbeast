import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { runExecution } from '../../src/phases/execution.js';
import { BeastContext } from '../../src/context/franken-context.js';
import {
  makeSkills,
  makeGovernor,
  makeMemory,
  makeObserver,
  makeLogger,
} from '../helpers/stubs.js';
import type { ICheckpointStore, SkillInput, SkillResult } from '../../src/deps.js';
import type { CliSkillExecutor } from '../../src/skills/cli-skill-executor.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

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

function ctx(
  tasks = [{ id: 't1', objective: 'do it', requiredSkills: [] as string[], dependsOn: [] as string[] }],
): BeastContext {
  const c = new BeastContext('proj', 'sess', 'input');
  c.plan = { tasks };
  return c;
}

describe('execution checkpoint wiring', () => {
  // ── Skip on checkpoint ──

  it('skips a task when checkpoint entry exists', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
    });
    const c = ctx();
    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('success');
    expect(checkpoint.has).toHaveBeenCalledWith('t1:done');
  });

  it('produces TaskOutcome with status success for checkpointed tasks', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
    });
    const c = ctx();
    const memory = makeMemory();
    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      memory,
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    expect(outcomes[0]!.taskId).toBe('t1');
    expect(outcomes[0]!.status).toBe('success');
    // Should NOT execute (no trace recorded for checkpointed tasks)
    expect(memory.recordTrace).not.toHaveBeenCalled();
  });

  // ── Write milestone on complete ──

  it('writes milestone checkpoint after successful task execution', async () => {
    const checkpoint = makeCheckpoint();
    const c = ctx();
    await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    expect(checkpoint.write).toHaveBeenCalledWith('t1:done');
  });

  it('does not write milestone for failed tasks', async () => {
    const checkpoint = makeCheckpoint();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => { throw new Error('boom'); }),
    });
    const c = ctx([
      { id: 't1', objective: 'fail', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    await runExecution(
      c,
      skills,
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    expect(checkpoint.write).not.toHaveBeenCalledWith('t1:done');
  });

  // ── Checkpoint is optional ──

  it('works without checkpoint (backward compatible)', async () => {
    const c = ctx();
    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('success');
  });

  // ── Multiple tasks with partial checkpoint ──

  it('skips only checkpointed tasks and executes the rest', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
    ]);
    const memory = makeMemory();
    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      memory,
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]!.status).toBe('success'); // t1 checkpointed
    expect(outcomes[1]!.status).toBe('success'); // t2 still runs
    // t2 should still be marked as completed in checkpoint
    expect(checkpoint.write).toHaveBeenCalledWith('t2:done');
  });

  it('treats checkpointed tasks as completed for dependency resolution', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
    });
    const execute = vi.fn(async () => ({
      output: 'result',
      tokensUsed: 1,
    }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['beta'], dependsOn: ['t1'] },
    ]);
    const outcomes = await runExecution(
      c,
      skills,
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      checkpoint,
    );

    // t1 completed via checkpoint, t2 should execute (not blocked by unmet deps)
    expect(outcomes[0]!.status).toBe('success');
    expect(outcomes[1]!.status).toBe('success');
  });

  // ── Logging ──

  it('logs when skipping a checkpointed task', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
    });
    const logger = makeLogger();
    const c = ctx();
    await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      logger,
      undefined,
      checkpoint,
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping'),
      expect.objectContaining({ taskId: 't1' }),
    );
  });
});

describe('CliSkillExecutor per-commit checkpoint', () => {
  function makeCliExecutor(overrides: Partial<CliSkillExecutor> = {}): CliSkillExecutor {
    return {
      execute: vi.fn(async (_skillId: string, _input: SkillInput, _config: unknown): Promise<SkillResult> => ({
        output: 'cli-output',
        tokensUsed: 5,
      })),
      ...overrides,
    } as unknown as CliSkillExecutor;
  }

  it('checkpoint is passed to CliSkillExecutor and recordCommit is callable', async () => {
    const checkpoint = makeCheckpoint();
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(
      c,
      skills,
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      cliExec,
      checkpoint,
    );

    expect(outcomes[0]!.status).toBe('success');
    expect(checkpoint.write).toHaveBeenCalledWith('t1:done');
  });
});

describe('dirty file resume logic', () => {
  function makeCliExecutorWithRecovery(
    recoverResult: 'clean' | 'committed' | 'reset' = 'clean',
  ): CliSkillExecutor {
    return {
      execute: vi.fn(async (): Promise<SkillResult> => ({
        output: 'cli-output',
        tokensUsed: 5,
      })),
      recoverDirtyFiles: vi.fn(async () => recoverResult),
    } as unknown as CliSkillExecutor;
  }

  it('calls recoverDirtyFiles when task has partial checkpoints but no milestone', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const cliExec = makeCliExecutorWithRecovery('clean');
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    await runExecution(
      c, skills, makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    expect((cliExec as any).recoverDirtyFiles).toHaveBeenCalledWith(
      't1', 'impl', checkpoint, expect.anything(),
    );
  });

  it('does NOT call recoverDirtyFiles when task has no partial checkpoints', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => undefined),
    });
    const cliExec = makeCliExecutorWithRecovery('clean');
    const c = ctx();

    await runExecution(
      c, makeSkills(), makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    expect((cliExec as any).recoverDirtyFiles).not.toHaveBeenCalled();
  });

  it('does NOT call recoverDirtyFiles when task already has milestone', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn((key: string) => key === 't1:done'),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const cliExec = makeCliExecutorWithRecovery('clean');
    const c = ctx();

    await runExecution(
      c, makeSkills(), makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    // Task is skipped via milestone, recovery not needed
    expect((cliExec as any).recoverDirtyFiles).not.toHaveBeenCalled();
  });

  it('does NOT call recoverDirtyFiles when no cliExecutor is provided', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const c = ctx();

    // Should not throw
    const outcomes = await runExecution(
      c, makeSkills(), makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), undefined, checkpoint,
    );

    expect(outcomes[0]!.status).toBe('success');
  });

  it('continues execution after successful recovery (committed)', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const cliExec = makeCliExecutorWithRecovery('committed');
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(
      c, skills, makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    expect(outcomes[0]!.status).toBe('success');
    expect(cliExec.execute).toHaveBeenCalled();
  });

  it('continues execution after reset recovery', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const cliExec = makeCliExecutorWithRecovery('reset');
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(
      c, skills, makeGovernor(), makeMemory(), makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    // Task still executes after reset (re-executes from clean state)
    expect(outcomes[0]!.status).toBe('success');
    expect(cliExec.execute).toHaveBeenCalled();
  });

  it('returns task failure when recoverDirtyFiles throws (does not abort execution phase)', async () => {
    const checkpoint = makeCheckpoint({
      has: vi.fn(() => false),
      lastCommit: vi.fn(() => 'abc123'),
    });
    const cliExec = {
      execute: vi.fn(async (): Promise<SkillResult> => ({
        output: 'cli-output',
        tokensUsed: 5,
      })),
      recoverDirtyFiles: vi.fn(async () => {
        throw new Error('recovery exploded');
      }),
    } as unknown as CliSkillExecutor;
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const memory = makeMemory();
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(
      c, skills, makeGovernor(), memory, makeObserver(),
      undefined, makeLogger(), cliExec, checkpoint,
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain('recovery exploded');
    expect(cliExec.execute).not.toHaveBeenCalled();
    expect(memory.recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', outcome: 'failure' }),
    );
  });
});

describe('CliSkillExecutor.recoverDirtyFiles', () => {
  function makeMockGit() {
    return {
      isolate: vi.fn(),
      merge: vi.fn().mockReturnValue({ merged: true, commits: 1 }),
      autoCommit: vi.fn().mockReturnValue(true),
      hasMeaningfulChange: vi.fn(),
      getCurrentHead: vi.fn().mockReturnValue('recovery_hash'),
      getStatus: vi.fn().mockReturnValue(''),
      resetHard: vi.fn(),
      getWorkingDir: vi.fn().mockReturnValue('/tmp'),
    };
  }

  function makeMockMartin() {
    return { run: vi.fn() };
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
      costCalc: { totalCost: vi.fn().mockReturnValue(0) },
      breaker: { check: vi.fn().mockReturnValue({ tripped: false, limitUsd: 10, spendUsd: 0 }) },
      loopDetector: { check: vi.fn().mockReturnValue({ detected: false }) },
      startSpan: vi.fn().mockImplementation(() => ({ id: `span-${spanCount++}` })),
      endSpan: vi.fn(),
      recordTokenUsage: vi.fn(),
      setMetadata: vi.fn(),
    };
  }

  const mockedExecSync = vi.mocked(execSync);

  function mockVerifyPass(): void {
    mockedExecSync.mockImplementation(() => 'ok');
  }

  function mockVerifyFail(): void {
    mockedExecSync.mockImplementation(() => {
      throw new Error('verify failed');
    });
  }

  it('returns clean when git status is empty', async () => {
    const git = makeMockGit();
    git.getStatus.mockReturnValue('');
    mockVerifyPass();
    const { CliSkillExecutor } = await import('../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(makeMockMartin() as any, git as any, makeMockObserver());

    const checkpoint = makeCheckpoint({ lastCommit: vi.fn(() => 'abc123') });
    const result = await executor.recoverDirtyFiles('t1', 'impl', checkpoint, makeLogger());

    expect(result).toBe('clean');
    expect(git.autoCommit).not.toHaveBeenCalled();
    expect(git.resetHard).not.toHaveBeenCalled();
  });

  it('auto-commits dirty files when verification passes', async () => {
    const git = makeMockGit();
    git.getStatus.mockReturnValue('M src/file.ts');
    mockVerifyPass();
    const { CliSkillExecutor } = await import('../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(makeMockMartin() as any, git as any, makeMockObserver(), 'echo ok');

    const checkpoint = makeCheckpoint({ lastCommit: vi.fn(() => 'abc123') });
    const result = await executor.recoverDirtyFiles('t1', 'impl', checkpoint, makeLogger());

    expect(result).toBe('committed');
    expect(git.autoCommit).toHaveBeenCalledWith('t1', 'recovery', 0);
    expect(checkpoint.recordCommit).toHaveBeenCalledWith('t1', 'impl', -1, 'recovery_hash');
  });

  it('normalizes stage-prefixed taskId before recovery auto-commit', async () => {
    const git = makeMockGit();
    git.getStatus.mockReturnValue('M src/file.ts');
    mockVerifyPass();
    const { CliSkillExecutor } = await import('../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(makeMockMartin() as any, git as any, makeMockObserver(), 'echo ok');

    const checkpoint = makeCheckpoint({ lastCommit: vi.fn(() => 'abc123') });
    const result = await executor.recoverDirtyFiles('impl:11_rate_limit_resilience', 'impl', checkpoint, makeLogger());

    expect(result).toBe('committed');
    expect(git.autoCommit).toHaveBeenCalledWith('11_rate_limit_resilience', 'recovery', 0);
    expect(checkpoint.recordCommit).toHaveBeenCalledWith('impl:11_rate_limit_resilience', 'impl', -1, 'recovery_hash');
  });

  it('resets to last commit when verification fails', async () => {
    const git = makeMockGit();
    git.getStatus.mockReturnValue('M src/broken.ts');
    mockVerifyFail();
    const { CliSkillExecutor } = await import('../../src/skills/cli-skill-executor.js');
    const executor = new CliSkillExecutor(makeMockMartin() as any, git as any, makeMockObserver(), 'exit 1');

    const checkpoint = makeCheckpoint({ lastCommit: vi.fn(() => 'last_good_hash') });
    const logger = makeLogger();
    const result = await executor.recoverDirtyFiles('t1', 'impl', checkpoint, logger);

    expect(result).toBe('reset');
    expect(git.resetHard).toHaveBeenCalledWith('last_good_hash');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reset'),
      expect.objectContaining({ taskId: 't1' }),
      'git',
    );
  });

  it('auto-commits dirty files when no verify command is configured', async () => {
    const git = makeMockGit();
    git.getStatus.mockReturnValue('M src/file.ts');
    mockVerifyPass();
    const { CliSkillExecutor } = await import('../../src/skills/cli-skill-executor.js');
    // No verifyCommand passed to constructor
    const executor = new CliSkillExecutor(makeMockMartin() as any, git as any, makeMockObserver());

    const checkpoint = makeCheckpoint({ lastCommit: vi.fn(() => 'abc123') });
    const result = await executor.recoverDirtyFiles('t1', 'impl', checkpoint, makeLogger());

    expect(result).toBe('committed');
    expect(git.autoCommit).toHaveBeenCalled();
  });
});
