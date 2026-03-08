import { describe, it, expect, vi } from 'vitest';
import { runExecution } from '../../../src/phases/execution.js';
import { BeastContext } from '../../../src/context/franken-context.js';
import { makeSkills, makeGovernor, makeMemory, makeObserver, makeLogger } from '../../helpers/stubs.js';
import type { CliSkillExecutor } from '../../../src/skills/cli-skill-executor.js';
import type { SkillInput, SkillResult } from '../../../src/deps.js';

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

  it('records trace for each completed task', async () => {
    const memory = makeMemory();
    const c = ctx();
    await runExecution(c, makeSkills(), makeGovernor(), memory, makeObserver());

    expect(memory.recordTrace).toHaveBeenCalledTimes(1);
    expect(memory.recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', outcome: 'success' }),
    );
  });

  it('emits spans for each task', async () => {
    const observer = makeObserver();
    const c = ctx();
    await runExecution(c, makeSkills(), makeGovernor(), makeMemory(), observer);

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

  it('checks HITL requirement and requests governor approval', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true },
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
  });

  it('skips task when governor rejects', async () => {
    const skills = makeSkills({
      getAvailableSkills: vi.fn(() => [
        { id: 'deploy', name: 'Deploy', requiresHitl: true },
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
      expect.objectContaining({ taskId: 't1', outcome: 'failure' }),
    );
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
        { id: 'deploy', name: 'Deploy', requiresHitl: true },
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
});
