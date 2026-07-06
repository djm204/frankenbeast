import { describe, it, expect, vi } from 'vitest';
import { runClosure } from '../../../src/phases/closure.js';
import { BeastContext } from '../../../src/context/franken-context.js';
import { makeObserver, makeHeartbeat, makeLogger } from '../../helpers/stubs.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import type { TaskOutcome } from '../../../src/types.js';
import { PrCreationRequiredActionError } from '../../../src/closure/pr-creator.js';

function ctx(): BeastContext {
  const c = new BeastContext('proj', 'sess', 'input');
  c.plan = { tasks: [{ id: 't1', objective: 'test', requiredSkills: [], dependsOn: [] }] };
  return c;
}

const successOutcomes: TaskOutcome[] = [
  { taskId: 't1', status: 'success' },
];

const mixedOutcomes: TaskOutcome[] = [
  { taskId: 't1', status: 'success' },
  { taskId: 't2', status: 'failure', error: 'boom' },
];

const allSkippedOutcomes: TaskOutcome[] = [
  { taskId: 't1', status: 'skipped' },
  { taskId: 't2', status: 'skipped' },
];

describe('runClosure', () => {
  it('returns completed result when all tasks succeed', async () => {
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), successOutcomes);

    expect(result.status).toBe('completed');
    expect(result.phase).toBe('closure');
    expect(result.projectId).toBe('proj');
    expect(result.sessionId).toBe('sess');
  });

  it('returns failed result when any task failed', async () => {
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), mixedOutcomes);

    expect(result.status).toBe('failed');
    expect(result.taskResults).toHaveLength(2);
  });

  it('collects token spend from observer', async () => {
    const observer = makeObserver({
      getTokenSpend: vi.fn(async () => ({
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        estimatedCostUsd: 0.05,
      })),
    });

    const result = await runClosure(ctx(), observer, makeHeartbeat(), defaultConfig(), successOutcomes);

    expect(result.tokenSpend.totalTokens).toBe(700);
    expect(result.tokenSpend.estimatedCostUsd).toBe(0.05);
    expect(observer.getTokenSpend).toHaveBeenCalledWith('sess');
  });

  it('runs heartbeat pulse when enabled', async () => {
    const heartbeat = makeHeartbeat();
    await runClosure(ctx(), makeObserver(), heartbeat, { ...defaultConfig(), enableHeartbeat: true }, successOutcomes);

    expect(heartbeat.pulse).toHaveBeenCalledTimes(1);
  });

  it('skips heartbeat pulse when disabled', async () => {
    const heartbeat = makeHeartbeat();
    const config = { ...defaultConfig(), enableHeartbeat: false };
    await runClosure(ctx(), makeObserver(), heartbeat, config, successOutcomes);

    expect(heartbeat.pulse).not.toHaveBeenCalled();
  });

  it('handles heartbeat failure gracefully', async () => {
    const heartbeat = makeHeartbeat({
      pulse: vi.fn(async () => { throw new Error('heartbeat down'); }),
    });

    const result = await runClosure(ctx(), makeObserver(), heartbeat, { ...defaultConfig(), enableHeartbeat: true }, successOutcomes);

    expect(result.status).toBe('completed'); // Non-fatal
    const failAudit = result.sessionId; // just ensure it didn't throw
    expect(failAudit).toBeTruthy();
  });

  it('returns no-op status when all tasks are skipped', async () => {
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), allSkippedOutcomes);

    expect(result.status).toBe('no-op');
    expect(result.taskResults).toHaveLength(2);
  });

  it('returns failed status when mix of skipped and failed tasks', async () => {
    const skippedAndFailed: TaskOutcome[] = [
      { taskId: 't1', status: 'skipped' },
      { taskId: 't2', status: 'failure', error: 'boom' },
    ];
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), skippedAndFailed);

    expect(result.status).toBe('failed');
  });

  it('returns failed status when all tasks skipped due to unmet dependencies', async () => {
    const blockedByDeps: TaskOutcome[] = [
      { taskId: 't1', status: 'skipped', error: 'Unmet dependencies' },
      { taskId: 't2', status: 'skipped', error: 'Unmet dependencies' },
    ];
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), blockedByDeps);

    expect(result.status).toBe('failed');
    expect(result.taskResults).toHaveLength(2);
  });

  it('returns failed status when all tasks skipped due to governor rejection', async () => {
    const governorRejected: TaskOutcome[] = [
      { taskId: 't1', status: 'skipped', error: 'Rejected' },
    ];
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), governorRejected);

    expect(result.status).toBe('failed');
  });

  it('returns no-op when all tasks are intentionally skipped with no error', async () => {
    const intentionalSkips: TaskOutcome[] = [
      { taskId: 't1', status: 'skipped' },
    ];
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), intentionalSkips);

    expect(result.status).toBe('no-op');
  });

  it('returns no-op when there are no task outcomes (empty plan)', async () => {
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), []);

    expect(result.status).toBe('no-op');
  });

  it('returns failed when all tasks skipped with an empty rejection reason', async () => {
    const emptyReasonSkips: TaskOutcome[] = [
      { taskId: 't1', status: 'skipped', error: '' },
    ];
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), emptyReasonSkips);

    expect(result.status).toBe('failed');
  });

  it('includes plan summary when plan exists', async () => {
    const result = await runClosure(ctx(), makeObserver(), makeHeartbeat(), defaultConfig(), successOutcomes);
    expect(result.planSummary).toBe('1 task(s) planned');
  });

  it('adds audit entries', async () => {
    const c = ctx();
    await runClosure(c, makeObserver(), makeHeartbeat(), { ...defaultConfig(), enableHeartbeat: true }, successOutcomes);

    expect(c.audit.some(a => a.action === 'tokenSpend:collected')).toBe(true);
    expect(c.audit.some(a => a.action === 'pulse:complete')).toBe(true);
  });

  it('fails the run when PR creation requires user action after successful tasks', async () => {
    const logger = makeLogger();
    const prCreator = {
      create: vi.fn(async () => {
        throw new PrCreationRequiredActionError({
          message: 'PR not created: run `gh auth login`; branch feature/auth-warning is pushed.',
          action: 'run `gh auth login` and retry PR creation',
          branch: 'feature/auth-warning',
        });
      }),
    };

    const result = await runClosure(
      ctx(),
      makeObserver(),
      makeHeartbeat(),
      defaultConfig(),
      successOutcomes,
      logger,
      prCreator as never,
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('gh auth login');
    expect(logger.warn).toHaveBeenCalledWith(
      'Closure: PR creation requires user action',
      expect.objectContaining({ branch: 'feature/auth-warning' }),
    );
  });

  it('logs token spend and heartbeat result', async () => {
    const logger = makeLogger();
    const observer = makeObserver({
      getTokenSpend: vi.fn(async () => ({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.01,
      })),
    });
    const heartbeat = makeHeartbeat();

    await runClosure(ctx(), observer, heartbeat, { ...defaultConfig(), enableHeartbeat: true }, successOutcomes, logger);

    expect(logger.info).toHaveBeenCalledWith(
      'Closure: token spend',
      expect.objectContaining({ totalTokens: 30, estimatedCostUsd: 0.01 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Closure: heartbeat pulse',
      expect.objectContaining({ improvements: 0, techDebt: 0 }),
    );
  });
});
