import { describe, it, expect, vi } from 'vitest';
import { ActionDispatcher } from '../../../src/reporter/action-dispatcher.js';
import type { IPlannerModule } from '../../../src/modules/planner.js';
import type { IHitlGateway } from '../../../src/modules/hitl.js';
import type { Action, HeartbeatReport } from '../../../src/core/types.js';

function makePlannerStub(): IPlannerModule {
  return { injectTask: vi.fn().mockResolvedValue(undefined) };
}

function makeHitlStub(): IHitlGateway {
  return {
    sendMorningBrief: vi.fn().mockResolvedValue(undefined),
    notifyAlert: vi.fn().mockResolvedValue(undefined),
  };
}

const REPORT: HeartbeatReport = {
  timestamp: '2026-02-19T02:00:00Z',
  pulseResult: { status: 'HEARTBEAT_OK' },
  actions: [],
};

describe('ActionDispatcher', () => {
  it('dispatches planner_task to IPlannerModule', async () => {
    const planner = makePlannerStub();
    const dispatcher = new ActionDispatcher({ planner, hitl: makeHitlStub() });
    const actions: Action[] = [
      { type: 'planner_task', payload: { description: 'refactor API', priority: 'medium' } },
    ];

    await dispatcher.dispatch(actions, REPORT);
    expect(planner.injectTask).toHaveBeenCalledTimes(1);
  });

  it('dispatches skill_proposal to IPlannerModule', async () => {
    const planner = makePlannerStub();
    const dispatcher = new ActionDispatcher({ planner, hitl: makeHitlStub() });
    const actions: Action[] = [
      { type: 'skill_proposal', payload: { description: 'new skill', priority: 'high' } },
    ];

    await dispatcher.dispatch(actions, REPORT);
    expect(planner.injectTask).toHaveBeenCalledTimes(1);
  });

  it('dispatches morning_brief to IHitlGateway', async () => {
    const hitl = makeHitlStub();
    const dispatcher = new ActionDispatcher({ planner: makePlannerStub(), hitl });
    const actions: Action[] = [{ type: 'morning_brief', payload: {} }];

    await dispatcher.dispatch(actions, REPORT);
    expect(hitl.sendMorningBrief).toHaveBeenCalledWith(REPORT);
  });

  it('handles dispatch failure gracefully', async () => {
    const planner: IPlannerModule = {
      injectTask: vi.fn().mockRejectedValue(new Error('planner down')),
    };
    const dispatcher = new ActionDispatcher({ planner, hitl: makeHitlStub() });
    const actions: Action[] = [
      { type: 'planner_task', payload: { description: 'task', priority: 'low' } },
    ];

    // Should not throw
    await expect(dispatcher.dispatch(actions, REPORT)).resolves.not.toThrow();
  });

  it('skips dispatch when no actions to take', async () => {
    const planner = makePlannerStub();
    const hitl = makeHitlStub();
    const dispatcher = new ActionDispatcher({ planner, hitl });

    await dispatcher.dispatch([], REPORT);
    expect(planner.injectTask).not.toHaveBeenCalled();
    expect(hitl.sendMorningBrief).not.toHaveBeenCalled();
  });
});
