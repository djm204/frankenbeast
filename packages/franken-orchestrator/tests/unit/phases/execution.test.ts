import { describe, it, expect, vi } from 'vitest';
import { runExecution } from '../../../src/phases/execution.js';
import { BeastContext } from '../../../src/context/franken-context.js';
import { makeSkills, makeGovernor, makeMemory, makeObserver, makeLogger } from '../../helpers/stubs.js';
import type { CliSkillExecutor } from '../../../src/skills/cli-skill-executor.js';
import type { IMcpModule, SkillInput, SkillResult } from '../../../src/deps.js';

function ctx(tasks = [{ id: 't1', objective: 'do it', requiredSkills: [] as string[], dependsOn: [] as string[] }]): BeastContext {
  const c = new BeastContext('proj', 'sess', 'input');
  c.plan = { tasks };
  return c;
}

describe('runExecution', () => {
  it('executes a single task successfully', async () => {
    const c = ctx();
    const outcomes = await runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.taskId).toBe('t1');
    expect(outcomes[0]!.status).toBe('success');
  });

  it('executes tasks in topological order', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
    ]);
    const memory = makeMemory();
    const outcomes = await runExecution(c, makeSkills(), makeGovernor(), memory, makeObserver());

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]!.taskId).toBe('t1');
    expect(outcomes[1]!.taskId).toBe('t2');
  });

  it('executes independent ready tasks in the same parallel wave', async () => {
    const active = new Set<string>();
    let observedOverlap = false;
    const execute = vi.fn(async (skillId: string) => {
      active.add(skillId);
      if (skillId === 'alpha') {
        await new Promise<void>(resolve => setTimeout(resolve, 25));
      } else if (skillId === 'beta') {
        observedOverlap = active.has('alpha');
      }
      active.delete(skillId);
      return { output: `${skillId}-output`, tokensUsed: 1 };
    });

    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'first independent task', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second independent task', requiredSkills: ['beta'], dependsOn: [] },
      { id: 't3', objective: 'dependent task', requiredSkills: ['gamma'], dependsOn: ['t1', 't2'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['t1', 't2', 't3']);
    expect(observedOverlap).toBe(true);
  });

  it('serializes ready CLI-backed tasks that share the checkout', async () => {
    const active = new Set<string>();
    let observedOverlap = false;
    const cliExec = makeCliExecutor({
      execute: vi.fn(async (skillId: string) => {
        observedOverlap ||= active.size > 0;
        active.add(skillId);
        await new Promise<void>(resolve => setTimeout(resolve, 5));
        active.delete(skillId);
        return { output: `${skillId}-output`, tokensUsed: 1 };
      }),
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'cli:alpha', name: 'Alpha CLI', requiresHitl: false, executionType: 'cli' },
        { id: 'cli:beta', name: 'Beta CLI', requiresHitl: false, executionType: 'cli' },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'first cli task', requiredSkills: ['cli:alpha'], dependsOn: [] },
      { id: 't2', objective: 'second cli task', requiredSkills: ['cli:beta'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['t1', 't2']);
    expect(cliExec.execute).toHaveBeenCalledTimes(2);
    expect((cliExec.execute as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0])).toEqual(['cli:alpha', 'cli:beta']);
    expect(observedOverlap).toBe(false);
  });

  it('serializes ready HITL-gated tasks so approval prompts do not overlap', async () => {
    let activeApprovalCount = 0;
    let observedOverlap = false;
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => {
        observedOverlap ||= activeApprovalCount > 0;
        activeApprovalCount += 1;
        await new Promise<void>(resolve => setTimeout(resolve, 5));
        activeApprovalCount -= 1;
        return { decision: 'approved' as const };
      }),
    });
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy-a', name: 'Deploy A', requiresHitl: true, executionType: 'function' as const },
        { id: 'deploy-b', name: 'Deploy B', requiresHitl: true, executionType: 'function' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'first deploy', requiredSkills: ['deploy-a'], dependsOn: [] },
      { id: 't2', objective: 'second deploy', requiredSkills: ['deploy-b'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, makeMemory(), makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['t1', 't2']);
    expect(governor.requestApproval).toHaveBeenCalledTimes(2);
    expect(observedOverlap).toBe(false);
  });

  it('records trace for each completed task', async () => {
    const memory = makeMemory();
    const c = ctx();
    await runExecution(c, makeSkills(), makeGovernor(), memory, makeObserver());

    expect(memory.recordTrace).toHaveBeenCalledTimes(1);
    expect(memory.recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', outcome: 'success' }),
    );
  });

  it('emits spans for each task when tracing is enabled', async () => {
    const observer = makeObserver();
    const c = ctx();
    await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      observer,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { enableTracing: true },
    );

    expect(observer.startSpan).toHaveBeenCalledWith('task:t1');
  });

  it('skips tasks with unmet dependencies', async () => {
    const c = ctx([
      { id: 't1', objective: 'orphan', requiredSkills: [], dependsOn: ['nonexistent'] },
    ]);
    const outcomes = await runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes[0]!.status).toBe('skipped');
    expect(outcomes[0]!.error).toContain('dependencies');
  });

  it('does not query skill descriptors for no-skill tasks', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => {
        throw new Error('manifest unavailable');
      }),
    });
    const c = ctx([
      { id: 't1', objective: 'passthrough', requiredSkills: [], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual(expect.objectContaining({ taskId: 't1', status: 'success' }));
    expect(skills.getAvailableSkills).not.toHaveBeenCalled();
  });

  it('records descriptor lookup failures as task failures for required-skill tasks', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => {
        throw new Error('manifest unavailable');
      }),
    });
    const c = ctx([
      { id: 't1', objective: 'requires alpha', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes).toEqual([
      expect.objectContaining({
        taskId: 't1',
        status: 'failure',
        error: expect.stringContaining('manifest unavailable'),
      }),
    ]);
  });

  it('checks HITL requirement and requests governor approval', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true, executionType: 'function' as const },
      ]),
    });
    const governor = makeGovernor();
    const c = ctx([
      { id: 't1', objective: 'deploy app', requiredSkills: ['deploy'], dependsOn: [] },
    ]);

    await runExecution(c, skills, governor, makeMemory(), makeObserver());
    expect(governor.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', requiresHitl: true }),
    );
    expect(c.governorApproval).toBe(true);
  });

  it('skips task when governor rejects', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true, executionType: 'function' as const },
      ]),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => ({
        decision: 'rejected' as const,
        reason: 'too risky',
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'deploy', requiredSkills: ['deploy'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, makeMemory(), makeObserver());
    expect(outcomes[0]!.status).toBe('skipped');
    expect(c.governorApproval).toBe(false);
    expect(c.circuitBreakerTripped).toBe(true);
  });

  it('surfaces the non-interactive approval escape hatch when a HITL task is rejected', async () => {
    const logger = makeLogger();
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true, executionType: 'function' as const },
      ]),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => ({
        decision: 'rejected' as const,
        reason: 'defaultDecision',
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'deploy', requiredSkills: ['deploy'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, makeMemory(), makeObserver(), undefined, logger);

    expect(outcomes[0]).toEqual(expect.objectContaining({
      status: 'skipped',
      error: expect.stringContaining('FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1'),
    }));
    expect(logger.warn).toHaveBeenCalledWith(
      'Execution: task rejected',
      expect.objectContaining({
        taskId: 't1',
        reason: expect.stringContaining('FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1'),
      }),
    );
  });

  it('tracks retry count and checkpoint path for execution recovery', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: [], dependsOn: [] },
    ]);
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn(() => false),
      write: vi.fn(),
      readAll: vi.fn(() => new Set<string>()),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
    };

    await runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, undefined, checkpoint);

    expect(c.retryCount).toBe(2);
    expect(c.checkpointPath).toBe('/tmp/franken-checkpoint.txt');
    expect(checkpoint.write).toHaveBeenCalledWith('t1:done');
    expect(checkpoint.write).toHaveBeenCalledWith('t2:done');
  });

  it('does not record in-memory completion when the checkpoint write fails', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
    ]);
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn(() => false),
      write: vi.fn(() => {
        throw new Error('disk full');
      }),
      readAll: vi.fn(() => new Set<string>()),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
    };

    await expect(
      runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, undefined, checkpoint),
    ).rejects.toThrow('disk full');
  });

  it('drains parallel peers before surfacing wave persistence errors', async () => {
    let slowPeerFinished = false;
    const execute = vi.fn(async (_skillId: string, input: SkillInput) => {
      if (input.objective === 'slow peer') {
        await new Promise(resolve => setTimeout(resolve, 20));
        slowPeerFinished = true;
      }
      return { output: input.objective, tokensUsed: 1 };
    });
    const c = ctx([
      { id: 't1', objective: 'fast failing checkpoint', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'slow peer', requiredSkills: ['alpha'], dependsOn: [] },
    ]);
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn(() => false),
      write: vi.fn((key: string) => {
        if (key === 't1:done') {
          throw new Error('disk full');
        }
      }),
      readAll: vi.fn(() => new Set<string>()),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
    };

    await expect(
      runExecution(
        c,
        makeSkills({ hasSkill: vi.fn(() => true), execute }),
        makeGovernor(),
        makeMemory(),
        makeObserver(),
        undefined,
        undefined,
        undefined,
        checkpoint,
      ),
    ).rejects.toThrow('disk full');

    expect(slowPeerFinished).toBe(true);
  });

  it('throws if plan is missing', async () => {
    const c = new BeastContext('proj', 'sess', 'input');
    await expect(
      runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver()),
    ).rejects.toThrow('Cannot execute without a plan');
  });

  it('adds execution summary audit', async () => {
    const c = ctx();
    await runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver());

    const done = c.audit.find(a => a.action === 'execution:done');
    expect(done).toBeDefined();
    expect((done!.detail as { succeeded: number }).succeeded).toBe(1);
  });

  it('threads dependency outputs into downstream skill input', async () => {
    const execute = vi.fn(async (skillId: string) => ({
      output: `${skillId}-output`,
      tokensUsed: 2,
    }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['beta'], dependsOn: ['t1'] },
    ]);

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    const secondCall = execute.mock.calls[1]!;
    const secondInput = secondCall[1];
    expect(secondInput.dependencyOutputs.get('t1')).toBe('alpha-output');
  });

  it('rehydrates dependency outputs for checkpointed tasks on resume', async () => {
    const execute = vi.fn(async (skillId: string, input: SkillInput) => {
      if (skillId === 'alpha') {
        return { output: { message: 'alpha-output' }, tokensUsed: 1 };
      }
      if (skillId === 'beta') {
        return { output: input.dependencyOutputs.get('t1'), tokensUsed: 1 };
      }
      throw new Error(`Unexpected skill: ${skillId}`);
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const checkpointOutputs = new Map<string, unknown>();
    const checkpointEntries = new Set<string>(['t1:done']);
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn((key: string) => checkpointEntries.has(key)),
      write: vi.fn((key: string) => checkpointEntries.add(key)),
      readAll: vi.fn(() => new Set(checkpointEntries)),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
      readTaskOutput: vi.fn((taskId: string) => ({
        found: checkpointOutputs.has(taskId),
        output: checkpointOutputs.get(taskId),
      })),
      writeTaskOutput: vi.fn((taskId: string, output: unknown) => {
        checkpointOutputs.set(taskId, output);
      }),
    };
    checkpointOutputs.set('t1', { message: 'persisted-alpha-output' });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['beta'], dependsOn: ['t1'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, undefined, checkpoint);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toBe('beta');
    expect(checkpoint.readTaskOutput).toHaveBeenCalledWith('t1');
    expect(outcomes[0]).toEqual({ taskId: 't1', status: 'success', output: { message: 'persisted-alpha-output' } });
    expect(outcomes[1]!.output).toEqual({ message: 'persisted-alpha-output' });
  });

  it('warns and audits when a checkpointed dependency output uses the stale cache fallback', async () => {
    const execute = vi.fn(async (_skillId: string, input: SkillInput) => ({
      output: input.dependencyOutputs.get('t1'),
      tokensUsed: 1,
    }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const checkpointEntries = new Set<string>(['t1:done']);
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn((key: string) => checkpointEntries.has(key)),
      write: vi.fn((key: string) => checkpointEntries.add(key)),
      readAll: vi.fn(() => new Set(checkpointEntries)),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
      readTaskOutput: vi.fn(() => ({
        found: true,
        output: { message: 'stale-alpha-output' },
        stale: true,
        staleReason: 'corrupt-primary' as const,
      })),
      writeTaskOutput: vi.fn(),
    };
    const logger = makeLogger();
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['beta'], dependsOn: ['t1'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, logger, undefined, checkpoint);

    expect(outcomes[1]!.output).toEqual({ message: 'stale-alpha-output' });
    expect(logger.warn).toHaveBeenCalledWith(
      'Execution: using stale dependency output cache for checkpointed task',
      {
        taskId: 't1',
        reason: 'corrupt-primary',
        checkpointPath: '/tmp/franken-checkpoint.txt',
      },
    );
    expect(c.audit).toContainEqual(expect.objectContaining({
      module: 'executor',
      action: 'dependency-output-cache:stale-fallback',
      detail: {
        taskId: 't1',
        reason: 'corrupt-primary',
        checkpointPath: '/tmp/franken-checkpoint.txt',
      },
    }));
  });

  it('passes through dependency output when no skills are required', async () => {
    const execute = vi.fn(async (skillId: string) => ({
      output: `${skillId}-output`,
      tokensUsed: 1,
    }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(outcomes[1]!.output).toBe('alpha-output');
  });

  it('skips skills.execute for passthrough tasks with no required skills', async () => {
    const execute = vi.fn(async () => ({ output: 'unused', tokensUsed: 1 }));
    const skills = makeSkills({
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'noop', requiredSkills: [], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('success');
    const output = outcomes[0]!.output as Map<string, unknown>;
    expect(output).toBeInstanceOf(Map);
    expect(output.size).toBe(0);
  });

  it('calls skills.execute for each required skill', async () => {
    const execute = vi.fn(async (skillId: string) => ({
      output: `${skillId}-out`,
      tokensUsed: 1,
    }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      {
        id: 't1',
        objective: 'run three skills',
        requiredSkills: ['alpha', 'beta', 'gamma'],
        dependsOn: [],
      },
    ]);

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.map(call => call[0])).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('fails when a required skill is missing and records failure trace', async () => {
    const memory = makeMemory();
    const skills = makeSkills({
      hasSkill: vi.fn(() => false),
    });
    const c = ctx([
      { id: 't1', objective: 'missing', requiredSkills: ['ghost'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain('ghost');
    expect(memory.recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', outcome: 'failure' }),
    );
  });

  it('builds skill input with objective, context, and dependency outputs', async () => {
    const execute = vi.fn(async (skillId: string) => ({
      output: `${skillId}-output`,
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
    c.sanitizedIntent = {
      goal: 'ship it',
      context: { adrs: ['ADR-1'], knownErrors: ['E1'], rules: ['R1'] },
    };

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    const secondInput = execute.mock.calls[1]![1];
    expect(secondInput.objective).toBe('second');
    expect(secondInput.context).toEqual({ adrs: ['ADR-1'], knownErrors: ['E1'], rules: ['R1'] });
    expect(secondInput.dependencyOutputs.get('t1')).toBe('alpha-output');
  });

  it('aggregates tokensUsed across multiple skills for audit', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi
        .fn()
        .mockResolvedValueOnce({ output: 'first', tokensUsed: 3 })
        .mockResolvedValueOnce({ output: 'second', tokensUsed: 5 }),
    });
    const c = ctx([
      { id: 't1', objective: 'multi', requiredSkills: ['a', 'b'], dependsOn: [] },
    ]);

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    const complete = c.audit.find(a => a.action === 'task:complete');
    expect(complete).toBeDefined();
    expect((complete!.detail as { tokensUsed: number }).tokensUsed).toBe(8);
  });

  it('sets task outcome output from skill result', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => ({ output: 'skill-result', tokensUsed: 2 })),
    });
    const c = ctx([
      { id: 't1', objective: 'single', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes[0]!.output).toBe('skill-result');
  });

  it('returns the last skill output when multiple skills run sequentially', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ output: 'alpha-result', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'beta-result', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'multi', requiredSkills: ['alpha', 'beta'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(execute.mock.calls.map(call => call[0])).toEqual(['alpha', 'beta']);
    expect(outcomes[0]!.output).toBe('beta-result');
  });

  it('fails when skill execution throws and records failure trace', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const memory = makeMemory();
    const c = ctx([
      { id: 't1', objective: 'explode', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain('boom');
    expect(memory.recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', outcome: 'failure', summary: 'boom' }),
    );
    expect(c.errorContext).toHaveLength(1);
    expect(c.errorContext![0]).toBeInstanceOf(Error);
    expect(c.errorContext![0]!.message).toBe('boom');
    expect(c.circuitBreakerTripped).toBe(true);
    expect(c.audit.find(a => a.action === 'recovery:failed')).toBeDefined();
  });

  it('does not seed known-error recovery from the current failure trace', async () => {
    const knownErrors: string[] = [];
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => {
        throw new Error('brand new runtime blowup');
      }),
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({ adrs: [], knownErrors, rules: [] })),
      recordTrace: vi.fn(async (trace) => {
        if (trace.outcome === 'failure') {
          knownErrors.push(`${trace.summary} => retry current failure`);
        }
      }),
    });
    const c = ctx([
      { id: 't1', objective: 'explode once', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes).toEqual([{ taskId: 't1', status: 'failure', error: 'brand new runtime blowup' }]);
    expect(skills.execute).toHaveBeenCalledTimes(1);
    expect(c.audit.find(a => a.action === 'recovery:failed')).toBeDefined();
    expect(c.audit.find(a => a.action === 'recovery:injected')).toBeUndefined();
  });

  it('injects a fix-it task and retries when a failed task matches a known error', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['[previous-task] disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.map(outcome => outcome.status)).toEqual(['success', 'success']);
    expect(outcomes[0]!.taskId).toBe('fix-t1-attempt-1');
    expect(outcomes[0]!.output).toBe('fix-output');
    expect(outcomes[1]).toEqual({ taskId: 't1', status: 'success', output: 'retry-output' });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls.map(call => call[0])).toEqual(['alpha', 'alpha', 'alpha']);
    expect(c.plan?.tasks).toEqual([
      { id: 'fix-t1-attempt-1', objective: 'free temporary files before retrying', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: ['fix-t1-attempt-1'] },
    ]);
    expect(c.audit.find(a => a.action === 'recovery:injected')).toBeDefined();
    expect(c.circuitBreakerTripped).toBe(false);
  });

  it('keeps the circuit breaker clear when peer wave failures are both recovered', async () => {
    const failedOnce = new Set<string>();
    const execute = vi.fn(async (_skillId: string, input: SkillInput) => {
      if (input.objective.startsWith('write artifact') && !failedOnce.has(input.objective)) {
        failedOnce.add(input.objective);
        throw new Error('disk full while writing artifact');
      }
      return { output: input.objective, tokensUsed: 1 };
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact one', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'write artifact two', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes).toHaveLength(4);
    expect(outcomes.every(outcome => outcome.status === 'success')).toBe(true);
    expect(c.circuitBreakerTripped).toBe(false);
  });

  it('keeps terminal peer wave failures from being requeued after recovery rebuilds pending', async () => {
    const seenRecoverable = new Set<string>();
    const execute = vi.fn(async (_skillId: string, input: SkillInput) => {
      if (input.objective === 'recoverable artifact' && !seenRecoverable.has(input.objective)) {
        seenRecoverable.add(input.objective);
        throw new Error('disk full while writing artifact');
      }
      if (input.objective === 'unknown artifact') {
        throw new Error('unknown transient explosion');
      }
      return { output: input.objective, tokensUsed: 1 };
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'recoverable artifact', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'unknown artifact', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.filter(outcome => outcome.taskId === 't2')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.taskId === 't2')).toEqual(expect.objectContaining({ status: 'failure' }));
    expect(outcomes.some(outcome => outcome.taskId === 't1' && outcome.status === 'success')).toBe(true);
    expect(c.circuitBreakerTripped).toBe(true);
  });

  it('does not requeue terminal skipped tasks when recovery rebuilds the graph', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn((id: string) => id === 'alpha'),
      execute,
      getAvailableSkills: vi.fn(() => [{ id: 'hitl', name: 'HITL', requiresHitl: true, executionType: 'function' as const }]),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => ({ decision: 'rejected', reason: 'nope' })),
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 'needs-human', objective: 'ask human', requiredSkills: ['hitl'], dependsOn: [] },
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, memory, makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['needs-human', 'fix-t1-attempt-1', 't1']);
    expect(governor.requestApproval).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(c.circuitBreakerTripped).toBe(true);
  });

  it('continues recovered attempts after resuming a plan with prior fix-it tasks', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 'fix-t1-attempt-1', objective: 'prior fix', requiredSkills: [], dependsOn: [] },
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: ['fix-t1-attempt-1'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['fix-t1-attempt-1', 'fix-t1-attempt-2', 't1']);
    expect(c.plan?.tasks.some(task => task.id === 'fix-t1-attempt-2')).toBe(true);
    expect(c.audit.find(a => a.action === 'recovery:injected')?.detail).toEqual(
      expect.objectContaining({ failedTaskId: 't1', attempt: 2 }),
    );
  });

  it('does not recursively recover generated fix-it task failures', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockRejectedValueOnce(new Error('disk full while applying fix'));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes).toEqual([
      { taskId: 'fix-t1-attempt-1', status: 'failure', error: 'disk full while applying fix' },
      { taskId: 't1', status: 'skipped', error: 'Unmet dependencies' },
    ]);
    expect(c.plan?.tasks.some(task => task.id.startsWith('fix-fix-'))).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('persists recovered plan tasks so resume keeps injected dependencies', async () => {
    const firstCheckpointEntries = new Set<string>();
    const recoveryOutputs = new Map<string, unknown>();
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn((key: string) => firstCheckpointEntries.has(key)),
      write: vi.fn((key: string) => { firstCheckpointEntries.add(key); }),
      readAll: vi.fn(() => new Set(firstCheckpointEntries)),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
      writeTaskOutput: vi.fn((taskId: string, output: unknown) => { recoveryOutputs.set(taskId, output); }),
      readTaskOutput: vi.fn((taskId: string) => ({ found: recoveryOutputs.has(taskId), output: recoveryOutputs.get(taskId) })),
    };
    const firstExecute = vi
      .fn()
      .mockResolvedValueOnce({ output: 'dep-output', tokensUsed: 1 })
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['alpha'], dependsOn: ['t1'] },
    ]);

    await runExecution(c, makeSkills({ hasSkill: vi.fn(() => true), execute: firstExecute }), makeGovernor(), memory, makeObserver(), undefined, undefined, undefined, checkpoint);

    expect([...firstCheckpointEntries].some(entry => entry.startsWith('recovery-task-v2:'))).toBe(true);
    expect([...firstCheckpointEntries].every(entry => entry.length < 4096)).toBe(true);
    firstCheckpointEntries.delete('t2:done');

    const secondInputs: SkillInput[] = [];
    const checkpointOutputs = new Map<string, unknown>([
      ['t1', 'dep-output'],
      ['fix-t2-attempt-1', 'fix-output'],
    ]);
    const resumeCheckpoint = {
      ...checkpoint,
      has: vi.fn((key: string) => firstCheckpointEntries.has(key) || key === 't1:done' || key === 'fix-t2-attempt-1:done'),
      readAll: vi.fn(() => new Set([...firstCheckpointEntries, 't1:done', 'fix-t2-attempt-1:done'])),
      readTaskOutput: vi.fn((taskId: string) => {
        if (checkpointOutputs.has(taskId)) {
          return { found: true, output: checkpointOutputs.get(taskId) };
        }
        return { found: recoveryOutputs.has(taskId), output: recoveryOutputs.get(taskId) };
      }),
      write: vi.fn((key: string) => { firstCheckpointEntries.add(key); }),
    };
    const secondExecute = vi.fn(async (_skillId: string, input: SkillInput) => {
      secondInputs.push(input);
      return { output: 'resume-output', tokensUsed: 1 };
    });
    const resumed = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['alpha'], dependsOn: ['t1'] },
    ]);

    await runExecution(resumed, makeSkills({ hasSkill: vi.fn(() => true), execute: secondExecute }), makeGovernor(), memory, makeObserver(), undefined, undefined, undefined, resumeCheckpoint);

    expect(secondInputs[0]!.dependencyOutputs.get('t1')).toBe('dep-output');
    expect(secondInputs[0]!.dependencyOutputs.get('fix-t2-attempt-1')).toBe('fix-output');
  });

  it('does not persist unchanged tasks with stripped missing dependencies during recovery', async () => {
    const checkpointEntries = new Set<string>();
    const recoveryOutputs = new Map<string, unknown>();
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn((key: string) => checkpointEntries.has(key)),
      write: vi.fn((key: string) => { checkpointEntries.add(key); }),
      readAll: vi.fn(() => new Set(checkpointEntries)),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
      writeTaskOutput: vi.fn((taskId: string, output: unknown) => { recoveryOutputs.set(taskId, output); }),
      readTaskOutput: vi.fn((taskId: string) => ({ found: recoveryOutputs.has(taskId), output: recoveryOutputs.get(taskId) })),
    };
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 'orphan', objective: 'blocked forever', requiredSkills: ['alpha'], dependsOn: ['missing'] },
    ]);

    await runExecution(c, makeSkills({ hasSkill: vi.fn(() => true), execute }), makeGovernor(), memory, makeObserver(), undefined, undefined, undefined, checkpoint);

    expect([...recoveryOutputs.values()]).not.toContainEqual(expect.objectContaining({ id: 'orphan', dependsOn: [] }));

    const resumed = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 'orphan', objective: 'blocked forever', requiredSkills: ['alpha'], dependsOn: ['missing'] },
    ]);
    const resumeOutcomes = await runExecution(resumed, makeSkills(), makeGovernor(), memory, makeObserver(), undefined, undefined, undefined, checkpoint);

    expect(resumeOutcomes.at(-1)).toEqual({ taskId: 'orphan', status: 'skipped', error: 'Unmet dependencies' });
  });

  it('keeps recovery checkpoint markers compact for long task objectives', async () => {
    const checkpointEntries = new Set<string>();
    const recoveryOutputs = new Map<string, unknown>();
    const checkpoint = {
      checkpointPath: '/tmp/franken-checkpoint.txt',
      has: vi.fn((key: string) => checkpointEntries.has(key)),
      write: vi.fn((key: string) => {
        if (key.length > 4096) throw new Error('Invalid checkpoint key');
        checkpointEntries.add(key);
      }),
      readAll: vi.fn(() => new Set(checkpointEntries)),
      clear: vi.fn(),
      recordCommit: vi.fn(),
      lastCommit: vi.fn(),
      writeTaskOutput: vi.fn((taskId: string, output: unknown) => { recoveryOutputs.set(taskId, output); }),
      readTaskOutput: vi.fn((taskId: string) => ({ found: recoveryOutputs.has(taskId), output: recoveryOutputs.get(taskId) })),
    };
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: `write artifact ${'x'.repeat(8000)}`, requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, makeSkills({ hasSkill: vi.fn(() => true), execute }), makeGovernor(), memory, makeObserver(), undefined, undefined, undefined, checkpoint);

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['fix-t1-attempt-1', 't1']);
    expect([...checkpointEntries].every(entry => entry.length < 4096)).toBe(true);
    expect([...recoveryOutputs.values()].some(output => (output as { id?: string }).id === 't1')).toBe(true);
  });

  it('escalates unknown recovery errors through the governor', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => {
        throw new Error('novel runtime failure');
      }),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async (_request) => ({ decision: 'rejected' as const, reason: 'needs operator triage' })),
    });
    const c = ctx([
      { id: 't1', objective: 'unknown work', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    await runExecution(c, skills, governor, makeMemory(), makeObserver());

    expect(governor.requestApproval).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 't1',
      requiresHitl: true,
      summary: expect.stringContaining('novel runtime failure'),
    }));
    expect(c.audit.find(a => a.action === 'recovery:unknown-error-escalated')).toBeDefined();
  });

  it('falls back to the original failure when unknown-error HITL escalation throws', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => {
        throw new Error('novel runtime failure');
      }),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => {
        throw new Error('approval channel unavailable');
      }),
    });
    const c = ctx([
      { id: 't1', objective: 'unknown work', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, makeMemory(), makeObserver());

    expect(outcomes).toEqual([{ taskId: 't1', status: 'failure', error: 'novel runtime failure' }]);
    expect(c.audit.find(a => a.action === 'recovery:unknown-error-escalation-failed')?.detail).toEqual(
      expect.objectContaining({ taskId: 't1', error: 'approval channel unavailable' }),
    );
  });

  it('recovers a known-error task even when unrelated tasks have missing dependencies', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn((id: string) => id === 'alpha'),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 'orphan', objective: 'blocked forever', requiredSkills: ['alpha'], dependsOn: ['missing'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['fix-t1-attempt-1', 't1', 'orphan']);
    expect(outcomes.at(-1)).toEqual({ taskId: 'orphan', status: 'skipped', error: 'Unmet dependencies' });
    expect(c.audit.find(a => a.action === 'recovery:injected')).toBeDefined();
  });

  it('preserves original dependency outputs when retrying a recovered task', async () => {
    const retryInputs: SkillInput[] = [];
    let secondAttempts = 0;
    const execute = vi.fn(async (_skillId: string, input: SkillInput): Promise<SkillResult> => {
      if (input.objective === 'first') {
        return { output: 'dep-output', tokensUsed: 1 };
      }
      if (input.objective === 'second') {
        secondAttempts += 1;
        retryInputs.push(input);
        if (secondAttempts === 1) {
          throw new Error('disk full while writing artifact');
        }
        return { output: 'retry-output', tokensUsed: 1 };
      }
      return { output: 'fix-output', tokensUsed: 1 };
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['alpha'], dependsOn: ['t1'] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['t1', 'fix-t2-attempt-1', 't2']);
    expect(retryInputs[1]!.dependencyOutputs?.get('t1')).toBe('dep-output');
    expect(retryInputs[1]!.dependencyOutputs?.get('fix-t2-attempt-1')).toBe('fix-output');
  });

  it('does not duplicate recovered tasks when refresh returns the current recovered plan', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full while writing artifact'))
      .mockResolvedValueOnce({ output: 'fix-output', tokensUsed: 1 })
      .mockResolvedValueOnce({ output: 'retry-output', tokensUsed: 1 });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'write artifact', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(
      c,
      skills,
      makeGovernor(),
      memory,
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      undefined,
      async () => c.plan?.tasks ?? [],
    );

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['fix-t1-attempt-1', 't1']);
  });

  it('does not requeue terminal failures when another task recovers later', async () => {
    const execute = vi.fn(async (_skillId: string, input: SkillInput): Promise<SkillResult> => {
      if (input.objective === 'unknown failure') {
        throw new Error('unknown boom');
      }
      if (input.objective === 'recoverable') {
        if (!execute.mock.calls.slice(0, -1).some(call => call[1]?.objective === 'recoverable')) {
          throw new Error('disk full while writing artifact');
        }
        return { output: 'retry-output', tokensUsed: 1 };
      }
      return { output: 'fix-output', tokensUsed: 1 };
    });
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const memory = makeMemory({
      getContext: vi.fn(async () => ({
        adrs: [],
        knownErrors: ['disk full => free temporary files before retrying'],
        rules: [],
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'unknown failure', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'recoverable', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), memory, makeObserver());

    expect(outcomes.map(outcome => outcome.taskId)).toEqual(['t1', 'fix-t2-attempt-1', 't2']);
    expect(outcomes[0]).toEqual({ taskId: 't1', status: 'failure', error: 'unknown boom' });
    expect(execute.mock.calls.filter(call => call[1]?.objective === 'unknown failure')).toHaveLength(1);
  });

  // ── CLI skill routing tests ──

  function makeCliExecutor(overrides: Partial<CliSkillExecutor> = {}): CliSkillExecutor {
    return {
      execute: vi.fn(async (_skillId: string, _input: SkillInput, _config: unknown): Promise<SkillResult> => ({
        output: 'cli-output',
        tokensUsed: 5,
      })),
      ...overrides,
    } as unknown as CliSkillExecutor;
  }

  it('routes cli executionType skills through cliExecutor', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'llm-output', tokensUsed: 1 })),
    });
    const c = ctx([
      { id: 't1', objective: 'build it', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(cliExec.execute).toHaveBeenCalledTimes(1);
    expect(cliExec.execute).toHaveBeenCalledWith('build', expect.objectContaining({ objective: 'build it' }), expect.anything(), undefined, 't1');
    expect(skills.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('success');
    expect(outcomes[0]!.output).toBe('cli-output');
  });

  it('routes mcp executionType skills through IMcpModule and uses tool output', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'search-server', description: 'Search tool' },
      ]),
      callTool: vi.fn(async () => ({ content: { answer: 'real mcp output' }, isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({
        objective: 'look this up',
        projectId: 'proj',
        sessionId: 'sess',
        dependencyOutputs: {},
      }),
      'search-server',
    );
    expect(skills.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('success');
    expect(outcomes[0]!.output).toEqual({ answer: 'real mcp output' });
  });

  it('fails closed for mcp skills when no IMcpModule is provided', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(skills.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain("MCP skill 'search' requires an IMcpModule");
  });

  it('fails closed for mcp skills when the matching server/tool is unavailable', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'other', serverId: 'other-server', description: 'Other tool' },
      ]),
      callTool: vi.fn(async () => ({ content: 'should not run', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(skills.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain("MCP skill 'search' is enabled but no matching MCP tool/server is available");
    expect(outcomes[0]!.error).toContain('Start/configure the MCP server or disable the skill');
  });

  it('fails closed for ambiguous MCP tool and server-id matches', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'other-server', description: 'Search tool' },
        { name: 'query', serverId: 'search', description: 'Query tool' },
      ]),
      callTool: vi.fn(async () => ({ content: 'should not run', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain("MCP skill 'search' is ambiguous");
  });

  it('executes exact MCP tool ids exposed from multi-tool servers', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn((skillId: string) => skillId === 'query'),
      getAvailableSkills: vi.fn(() => [
        { id: 'query', name: 'Query', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'query', serverId: 'search', description: 'Query tool' },
        { name: 'summarize', serverId: 'search', description: 'Summarize tool' },
      ]),
      callTool: vi.fn(async () => ({ content: 'query output', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['query'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('query', expect.objectContaining({ objective: 'look this up' }), 'search');
    expect(outcomes[0]!.status).toBe('success');
    expect(outcomes[0]!.output).toBe('query output');
  });

  it('passes schema-compatible MCP arguments when a tool declares an input schema', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'fbeast_memory_query', name: 'Memory Query', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        {
          name: 'fbeast_memory_query',
          serverId: 'memory',
          description: 'Query memory',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        },
      ]),
      callTool: vi.fn(async () => ({ content: 'memory output', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'what do we know about MCP?', requiredSkills: ['fbeast_memory_query'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('fbeast_memory_query', { query: 'what do we know about MCP?' }, 'memory');
    expect(outcomes[0]!.status).toBe('success');
  });

  it('maps objective to content for content-based MCP tool schemas', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'fbeast_critique_evaluate', name: 'Critique', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        {
          name: 'fbeast_critique_evaluate',
          serverId: 'fbeast',
          description: 'Evaluate content',
          inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        },
      ]),
      callTool: vi.fn(async () => ({ content: 'critique output', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'review this work', requiredSkills: ['fbeast_critique_evaluate'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('fbeast_critique_evaluate', { content: 'review this work' }, 'fbeast');
    expect(outcomes[0]!.status).toBe('success');
  });

  it('fails closed for duplicate MCP tool-name matches', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'memory', description: 'Memory search' },
        { name: 'search', serverId: 'web', description: 'Web search' },
      ]),
      callTool: vi.fn(async () => ({ content: 'should not run', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain('multiple MCP servers expose a tool named');
  });

  it('routes namespaced MCP tool ids when tool names collide', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'memory/search', name: 'Search', parentSkillId: 'memory', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'memory', description: 'Memory search' },
        { name: 'search', serverId: 'web', description: 'Web search' },
      ]),
      callTool: vi.fn(async () => ({ content: 'memory result', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['memory/search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('search', expect.objectContaining({ objective: 'look this up' }), 'memory');
    expect(outcomes[0]!.status).toBe('success');
    expect(outcomes[0]!.output).toBe('memory result');
  });

  it('passes server identity when a server-id match resolves to a duplicated tool name', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'serverA', name: 'Server A', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'serverA', description: 'A search' },
        { name: 'search', serverId: 'serverB', description: 'B search' },
      ]),
      callTool: vi.fn(async () => ({ content: 'should not run', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['serverA'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('search', expect.objectContaining({ objective: 'look this up' }), 'serverA');
    expect(outcomes[0]!.status).toBe('success');
  });

  it('prefers an exact same-server MCP tool match over sibling server tools', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'search', name: 'Search', requiresHitl: false, executionType: 'mcp' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'placeholder', tokensUsed: 1 })),
    });
    const mcp: IMcpModule = {
      getAvailableTools: vi.fn(() => [
        { name: 'search', serverId: 'search', description: 'Exact search' },
        { name: 'query', serverId: 'search', description: 'Sibling query' },
      ]),
      callTool: vi.fn(async () => ({ content: 'search output', isError: false })),
    };
    const c = ctx([
      { id: 't1', objective: 'look this up', requiredSkills: ['search'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), mcp);

    expect(mcp.callTool).toHaveBeenCalledWith('search', expect.objectContaining({ objective: 'look this up' }), 'search');
    expect(outcomes[0]!.status).toBe('success');
  });

  it('routes llm executionType skills through skills.execute (regression)', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'alpha', name: 'Alpha', requiresHitl: false, executionType: 'llm' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'llm-output', tokensUsed: 3 })),
    });
    const c = ctx([
      { id: 't1', objective: 'llm task', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(skills.execute).toHaveBeenCalledTimes(1);
    expect(cliExec.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.output).toBe('llm-output');
  });

  it('handles mixed cli and llm skills in the same plan', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
        { id: 'analyze', name: 'Analyze', requiresHitl: false, executionType: 'llm' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'llm-output', tokensUsed: 2 })),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
      { id: 't2', objective: 'analyze', requiredSkills: ['analyze'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(cliExec.execute).toHaveBeenCalledTimes(1);
    expect(skills.execute).toHaveBeenCalledTimes(1);
    expect(outcomes[0]!.output).toBe('cli-output');
    expect(outcomes[1]!.output).toBe('llm-output');
  });

  it('throws when cli skill has no cliExecutor provided', async () => {
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
    });
    const c = ctx([
      { id: 't1', objective: 'build', requiredSkills: ['build'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    expect(outcomes[0]!.status).toBe('failure');
    expect(outcomes[0]!.error).toContain("CLI skill 'build' requires a CliSkillExecutor but none was provided");
  });

  it('routes cli-prefixed skills through cliExecutor even without descriptors', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn((skillId: string) => skillId.startsWith('cli:')),
      getAvailableSkills: vi.fn(() => []),
      execute: vi.fn(async () => ({ output: 'fallback-output', tokensUsed: 1 })),
    });
    const c = ctx([
      { id: 't1', objective: 'implement chunk', requiredSkills: ['cli:chunk-1'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(cliExec.execute).toHaveBeenCalledWith('cli:chunk-1', expect.objectContaining({ objective: 'implement chunk' }), expect.anything(), undefined, 't1');
    expect(skills.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.output).toBe('cli-output');
  });

  it('falls through to skills.execute when skill not found in available skills list', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => []),  // skill not in available list
      execute: vi.fn(async () => ({ output: 'fallback-output', tokensUsed: 1 })),
    });
    const c = ctx([
      { id: 't1', objective: 'unknown', requiredSkills: ['mystery'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(skills.execute).toHaveBeenCalledTimes(1);
    expect(cliExec.execute).not.toHaveBeenCalled();
    expect(outcomes[0]!.output).toBe('fallback-output');
  });

  it('cli skills still respect requiresHitl on their SkillDescriptor', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true, executionType: 'cli' as const },
      ]),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => ({
        decision: 'rejected' as const,
        reason: 'too risky',
      })),
    });
    const c = ctx([
      { id: 't1', objective: 'deploy', requiredSkills: ['deploy'], dependsOn: [] },
    ]);

    const outcomes = await runExecution(c, skills, governor, makeMemory(), makeObserver(), undefined, undefined, cliExec);

    expect(governor.requestApproval).toHaveBeenCalled();
    expect(outcomes[0]!.status).toBe('skipped');
    expect(cliExec.execute).not.toHaveBeenCalled();
  });

  it('threads dependency outputs into cli skill input', async () => {
    const cliExec = makeCliExecutor();
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      getAvailableSkills: vi.fn(() => [
        { id: 'alpha', name: 'Alpha', requiresHitl: false, executionType: 'llm' as const },
        { id: 'build', name: 'Build', requiresHitl: false, executionType: 'cli' as const },
      ]),
      execute: vi.fn(async () => ({ output: 'alpha-result', tokensUsed: 1 })),
    });
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: ['alpha'], dependsOn: [] },
      { id: 't2', objective: 'second', requiredSkills: ['build'], dependsOn: ['t1'] },
    ]);

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver(), undefined, undefined, cliExec);

    const cliInput = (cliExec.execute as ReturnType<typeof vi.fn>).mock.calls[0]![1] as SkillInput;
    expect(cliInput.dependencyOutputs.get('t1')).toBe('alpha-result');
  });

  it('uses empty memory context when sanitizedIntent is undefined', async () => {
    const execute = vi.fn(async () => ({ output: 'ok', tokensUsed: 0 }));
    const skills = makeSkills({
      hasSkill: vi.fn(() => true),
      execute,
    });
    const c = ctx([
      { id: 't1', objective: 'no context', requiredSkills: ['alpha'], dependsOn: [] },
    ]);

    await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

    const input = execute.mock.calls[0]![1];
    expect(input.context).toEqual({ adrs: [], knownErrors: [], rules: [] });
  });

  it('logs task start/end, skill ids, and governor decisions', async () => {
    const logger = makeLogger();
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true, executionType: 'function' as const },
      ]),
      hasSkill: vi.fn(() => true),
      execute: vi.fn(async () => ({ output: 'done', tokensUsed: 2 })),
    });
    const governor = makeGovernor({
      requestApproval: vi.fn(async () => ({ decision: 'approved' as const })),
    });
    const c = ctx([
      { id: 't1', objective: 'deploy', requiredSkills: ['deploy'], dependsOn: [] },
    ]);

    await runExecution(c, skills, governor, makeMemory(), makeObserver(), undefined, logger);

    expect(logger.info).toHaveBeenCalledWith(
      'Execution: task start',
      expect.objectContaining({ taskId: 't1', skillIds: ['deploy'] }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Execution: governor decision',
      expect.objectContaining({ taskId: 't1', decision: 'approved' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Execution: task complete',
      expect.objectContaining({ taskId: 't1', status: 'success' }),
    );
  });

  it('refreshes plan during execution and runs newly discovered tasks', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
    ]);
    const refreshPlanTasks = vi
      .fn<() => Promise<readonly { id: string; objective: string; requiredSkills: readonly string[]; dependsOn: readonly string[] }[]>>()
      .mockResolvedValueOnce([
        { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
        { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
      ])
      .mockResolvedValueOnce([
        { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
        { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
      ]);

    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      undefined,
      refreshPlanTasks,
    );

    expect(outcomes.map(o => o.taskId)).toEqual(['t1', 't2']);
    expect(outcomes.every(o => o.status === 'success')).toBe(true);
  });

  it('rejects refreshed tasks that introduce dependency cycles before mutating the plan', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
    ]);
    const refreshPlanTasks = vi
      .fn<() => Promise<readonly { id: string; objective: string; requiredSkills: readonly string[]; dependsOn: readonly string[] }[]>>()
      .mockResolvedValueOnce([
        { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
        { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t3'] },
        { id: 't3', objective: 'third', requiredSkills: [], dependsOn: ['t2'] },
      ]);

    await expect(
      runExecution(
        c,
        makeSkills(),
        makeGovernor(),
        makeMemory(),
        makeObserver(),
        undefined,
        makeLogger(),
        undefined,
        undefined,
        refreshPlanTasks,
      ),
    ).rejects.toThrow('cycle detected');

    expect(c.plan!.tasks.map(t => t.id)).toEqual(['t1']);
  });

  it('rejects duplicate initial task ids before queueing pending work', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
      { id: 't1', objective: 'duplicate first', requiredSkills: [], dependsOn: [] },
    ]);

    await expect(runExecution(c, makeSkills(), makeGovernor(), makeMemory(), makeObserver()))
      .rejects.toThrow("duplicate task id 't1'");
  });

  it('keeps refreshed duplicate tasks out of the pending execution queue', async () => {
    const c = ctx([
      { id: 't1', objective: 'first', requiredSkills: [], dependsOn: [] },
    ]);
    const refreshPlanTasks = vi
      .fn<() => Promise<readonly { id: string; objective: string; requiredSkills: readonly string[]; dependsOn: readonly string[] }[]>>()
      .mockResolvedValueOnce([
        { id: 't1', objective: 'duplicate first', requiredSkills: [], dependsOn: [] },
        { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
        { id: 't2', objective: 'duplicate second', requiredSkills: [], dependsOn: ['t1'] },
      ])
      .mockResolvedValueOnce([
        { id: 't1', objective: 'duplicate first', requiredSkills: [], dependsOn: [] },
        { id: 't2', objective: 'second', requiredSkills: [], dependsOn: ['t1'] },
      ]);

    const outcomes = await runExecution(
      c,
      makeSkills(),
      makeGovernor(),
      makeMemory(),
      makeObserver(),
      undefined,
      makeLogger(),
      undefined,
      undefined,
      refreshPlanTasks,
    );

    expect(outcomes.map(o => o.taskId)).toEqual(['t1', 't2']);
    expect(c.plan!.tasks.map(t => t.id)).toEqual(['t1', 't2']);
  });
});
