import type { Action, HeartbeatReport } from '../core/types.js';
import type { IPlannerModule } from '../modules/planner.js';
import type { IHitlGateway } from '../modules/hitl.js';

export interface ActionDispatcherDeps {
  readonly planner: IPlannerModule;
  readonly hitl: IHitlGateway;
}

export class ActionDispatcher {
  private readonly deps: ActionDispatcherDeps;

  constructor(deps: ActionDispatcherDeps) {
    this.deps = deps;
  }

  async dispatch(actions: readonly Action[], report: HeartbeatReport): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'planner_task':
          case 'skill_proposal': {
            const payload = action.payload as { description?: string; priority?: string };
            await this.deps.planner.injectTask({
              description: payload.description ?? action.type,
              source: 'heartbeat',
              priority: (payload.priority as 'low' | 'medium' | 'high') ?? 'medium',
            });
            break;
          }
          case 'morning_brief':
            await this.deps.hitl.sendMorningBrief(report);
            break;
        }
      } catch {
        // Dispatch failures are logged but don't crash the heartbeat
      }
    }
  }
}
