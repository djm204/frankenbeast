import { afterEach, describe, expect, it, vi } from 'vitest';

import { SqliteBrain } from '@franken/brain';
import { ActionFacultyAdapter } from '../../../src/adapters/action-faculty-adapter.js';
import { createBeastDeps } from '../../../src/cli/create-beast-deps.js';
import type { ApprovalOutcome, ApprovalPayload, IGovernorModule } from '../../../src/deps.js';
import { checkModuleHealth } from '../../../src/resilience/module-initializer.js';
import { makeCritique, makeLogger, makeObserver, makePlanner } from '../../helpers/stubs.js';

describe('ActionFacultyAdapter', () => {
  const brains: SqliteBrain[] = [];

  afterEach(() => {
    for (const brain of brains.splice(0)) {
      brain.close();
    }
  });

  it.each([
    {
      label: 'approved',
      outcome: { decision: 'approved' } satisfies ApprovalOutcome,
      expectedReason: 'The governor approved the HITL request.',
    },
    {
      label: 'denied',
      outcome: { decision: 'rejected', reason: 'Operator denied production access' } satisfies ApprovalOutcome,
      expectedReason: 'Operator denied production access',
    },
  ])('delegates an $label decision unchanged and records a recallable governance episode', async ({
    outcome,
    expectedReason,
  }) => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const governor: IGovernorModule = {
      requestApproval: vi.fn(async () => outcome),
    };
    const faculty = new ActionFacultyAdapter(
      governor,
      brain.episodic,
      () => new Date('2026-07-24T15:00:00.000Z'),
    );
    const request: ApprovalPayload = {
      taskId: 'task-3696',
      summary: 'Deploy production release',
      skillId: 'deploy-prod',
      requiresHitl: true,
    };

    await expect(faculty.requestApproval(request)).resolves.toBe(outcome);
    expect(governor.requestApproval).toHaveBeenCalledWith(request);
    expect(faculty).toMatchObject({ kind: 'action', configured: true });
    expect(brain.episodic.recall('deploy production release')).toEqual([
      expect.objectContaining({
        type: 'decision',
        step: 'action:governor',
        summary: `Action decision (${outcome.decision}): Deploy production release`,
        createdAt: '2026-07-24T15:00:00.000Z',
        details: {
          taskId: 'task-3696',
          skillId: 'deploy-prod',
          requiresHitl: true,
          decision: outcome.decision,
          reason: expectedReason,
        },
      }),
    ]);
  });

  it('wires the same configured action faculty into SqliteBrain and the Beast governor port', async () => {
    const governor: IGovernorModule = {
      requestApproval: vi.fn(async () => ({
        decision: 'rejected' as const,
        reason: 'Policy requires a safer action',
      })),
    };
    const deps = createBeastDeps(
      {
        providers: [{ name: 'claude', type: 'claude-cli' }],
        reflection: false,
      },
      {
        planner: makePlanner(),
        critique: makeCritique(),
        governor,
        observer: makeObserver(),
        logger: makeLogger(),
        clock: () => new Date('2026-07-24T15:05:00.000Z'),
      },
    );

    try {
      expect(deps.sqliteBrain?.action).toBe(deps.governor);
      expect(deps.sqliteBrain?.action.configured).toBe(true);

      await checkModuleHealth(deps);
      expect(deps.sqliteBrain?.episodic.recall('health check')).toEqual([]);

      const request: ApprovalPayload = {
        taskId: 'wired-task',
        summary: 'Attempt a governed action',
        requiresHitl: true,
      };
      await expect(deps.sqliteBrain?.action.requestApproval(request)).resolves.toEqual({
        decision: 'rejected',
        reason: 'Policy requires a safer action',
      });

      expect(governor.requestApproval).toHaveBeenCalledWith(request);
      expect(deps.sqliteBrain?.episodic.recall('wired-task', 1)).toEqual([
        expect.objectContaining({
          type: 'decision',
          details: expect.objectContaining({
            decision: 'rejected',
            reason: 'Policy requires a safer action',
          }),
        }),
      ]);
    } finally {
      deps.sqliteBrain?.close();
    }
  });

  it('does not change an approval outcome when episodic recording fails', async () => {
    const brain = new SqliteBrain();
    brains.push(brain);
    const outcome = { decision: 'approved' as const };
    const governor: IGovernorModule = {
      requestApproval: vi.fn(async () => outcome),
    };
    const recordFailure = new Error('brain write failed');
    const onRecordError = vi.fn();
    vi.spyOn(brain.episodic, 'record').mockImplementation(() => {
      throw recordFailure;
    });
    const faculty = new ActionFacultyAdapter(
      governor,
      brain.episodic,
      () => new Date('2026-07-24T15:00:00.000Z'),
      onRecordError,
    );

    await expect(faculty.requestApproval({
      taskId: 'recording-failure',
      summary: 'Preserve the governor outcome',
      requiresHitl: true,
    })).resolves.toBe(outcome);
    expect(onRecordError).toHaveBeenCalledWith(recordFailure);
  });

  it('does not record action episodes when memory recording is disabled', async () => {
    const governor: IGovernorModule = {
      requestApproval: vi.fn(async () => ({ decision: 'approved' as const })),
    };
    const deps = createBeastDeps(
      {
        providers: [{ name: 'claude', type: 'claude-cli' }],
        reflection: false,
        action: { recordEpisodes: false },
      },
      {
        planner: makePlanner(),
        critique: makeCritique(),
        governor,
        observer: makeObserver(),
        logger: makeLogger(),
      },
    );

    try {
      await deps.governor.requestApproval({
        taskId: 'memory-disabled',
        summary: 'Do not retain this governed action',
        requiresHitl: true,
      });

      expect(deps.sqliteBrain?.episodic.recall('memory-disabled')).toEqual([]);
    } finally {
      deps.sqliteBrain?.close();
    }
  });

  it('leaves the brain action faculty inert when no concrete governor is enabled', () => {
    const governor: IGovernorModule = {
      requestApproval: vi.fn(async () => ({ decision: 'approved' as const })),
    };
    const deps = createBeastDeps(
      {
        providers: [{ name: 'claude', type: 'claude-cli' }],
        reflection: false,
        action: { enabled: false },
      },
      {
        planner: makePlanner(),
        critique: makeCritique(),
        governor,
        observer: makeObserver(),
        logger: makeLogger(),
      },
    );

    try {
      expect(deps.sqliteBrain?.action.configured).toBe(false);
      expect(deps.governor).toBe(governor);
    } finally {
      deps.sqliteBrain?.close();
    }
  });
});
