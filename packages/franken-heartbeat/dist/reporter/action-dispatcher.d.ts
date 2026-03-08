import type { Action, HeartbeatReport } from '../core/types.js';
import type { IPlannerModule } from '../modules/planner.js';
import type { IHitlGateway } from '../modules/hitl.js';
export interface ActionDispatcherDeps {
    readonly planner: IPlannerModule;
    readonly hitl: IHitlGateway;
}
export declare class ActionDispatcher {
    private readonly deps;
    constructor(deps: ActionDispatcherDeps);
    dispatch(actions: readonly Action[], report: HeartbeatReport): Promise<void>;
}
//# sourceMappingURL=action-dispatcher.d.ts.map