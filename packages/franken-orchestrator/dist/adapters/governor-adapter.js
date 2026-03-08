import { randomUUID } from 'node:crypto';
export class GovernorPortAdapter {
    gateway;
    projectId;
    defaultDecision;
    idFactory;
    clock;
    constructor(deps) {
        this.gateway = deps.gateway;
        this.projectId = deps.projectId;
        this.defaultDecision = deps.defaultDecision;
        this.idFactory = deps.idFactory ?? randomUUID;
        this.clock = deps.clock ?? (() => new Date());
    }
    async requestApproval(request) {
        if (!request.requiresHitl) {
            return { decision: 'approved' };
        }
        if (this.defaultDecision) {
            return { decision: this.defaultDecision, reason: 'defaultDecision' };
        }
        const approvalRequest = this.buildRequest(request);
        try {
            const outcome = await this.gateway.requestApproval(approvalRequest);
            return mapOutcome(outcome);
        }
        catch (error) {
            throw new Error(`GovernorPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
    }
    buildRequest(payload) {
        const trigger = {
            triggered: payload.requiresHitl,
            triggerId: 'hitl_required',
        };
        if (payload.requiresHitl) {
            trigger.reason = 'Task requires HITL approval';
            trigger.severity = 'high';
        }
        const request = {
            requestId: this.idFactory(),
            taskId: payload.taskId,
            projectId: this.projectId,
            trigger,
            summary: payload.summary,
            timestamp: this.clock(),
        };
        if (payload.skillId) {
            request.skillId = payload.skillId;
        }
        return request;
    }
}
function mapOutcome(outcome) {
    switch (outcome.decision) {
        case 'APPROVE':
            return { decision: 'approved' };
        case 'ABORT':
            return { decision: 'abort', reason: outcome.reason };
        case 'REGEN':
            return { decision: 'rejected', reason: outcome.feedback };
        case 'DEBUG':
            return { decision: 'rejected', reason: 'Debug requested' };
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=governor-adapter.js.map