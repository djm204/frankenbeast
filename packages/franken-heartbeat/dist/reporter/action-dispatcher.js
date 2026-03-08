export class ActionDispatcher {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async dispatch(actions, report) {
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'planner_task':
                    case 'skill_proposal': {
                        const payload = action.payload;
                        await this.deps.planner.injectTask({
                            description: payload.description ?? action.type,
                            source: 'heartbeat',
                            priority: payload.priority ?? 'medium',
                        });
                        break;
                    }
                    case 'morning_brief':
                        await this.deps.hitl.sendMorningBrief(report);
                        break;
                }
            }
            catch {
                // Dispatch failures are logged but don't crash the heartbeat
            }
        }
    }
}
//# sourceMappingURL=action-dispatcher.js.map