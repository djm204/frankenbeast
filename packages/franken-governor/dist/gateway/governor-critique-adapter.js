import { randomUUID } from 'node:crypto';
import { defaultConfig } from '../core/config.js';
import { ApprovalGateway } from './approval-gateway.js';
export class GovernorCritiqueAdapter {
    gateway;
    evaluators;
    projectId;
    constructor(deps) {
        this.gateway = new ApprovalGateway({
            channel: deps.channel,
            auditRecorder: deps.auditRecorder,
            config: defaultConfig(),
        });
        this.evaluators = deps.evaluators;
        this.projectId = deps.projectId;
    }
    async verifyRationale(rationale) {
        const triggerResult = this.evaluateTriggers(rationale);
        if (!triggerResult.triggered) {
            return { verdict: 'approved' };
        }
        const base = {
            requestId: randomUUID(),
            taskId: rationale.taskId,
            projectId: this.projectId,
            trigger: triggerResult,
            summary: `${rationale.reasoning} → ${rationale.expectedOutcome}`,
            timestamp: new Date(),
        };
        const request = rationale.selectedTool !== undefined
            ? { ...base, skillId: rationale.selectedTool }
            : base;
        const outcome = await this.gateway.requestApproval(request);
        switch (outcome.decision) {
            case 'APPROVE':
                return { verdict: 'approved' };
            case 'REGEN':
                return { verdict: 'rejected', reason: outcome.feedback };
            case 'ABORT':
                return { verdict: 'rejected', reason: outcome.reason ?? 'Aborted by human' };
            case 'DEBUG':
                return { verdict: 'approved' };
        }
    }
    evaluateTriggers(rationale) {
        for (const evaluator of this.evaluators) {
            const result = evaluator.evaluate(rationale);
            if (result.triggered)
                return result;
        }
        return { triggered: false, triggerId: 'none' };
    }
}
//# sourceMappingURL=governor-critique-adapter.js.map