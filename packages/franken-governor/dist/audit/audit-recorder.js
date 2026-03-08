export class GovernorAuditRecorder {
    memoryPort;
    constructor(memoryPort) {
        this.memoryPort = memoryPort;
    }
    async record(request, response) {
        const trace = {
            id: request.requestId,
            type: 'episodic',
            projectId: request.projectId,
            status: this.toStatus(response.decision),
            createdAt: Date.now(),
            taskId: request.taskId,
            toolName: 'hitl-gateway',
            input: {
                summary: request.summary,
                triggerId: request.trigger.triggerId,
                triggerReason: request.trigger.reason,
                triggerSeverity: request.trigger.severity,
            },
            output: {
                decision: response.decision,
                respondedBy: response.respondedBy,
                feedback: response.feedback,
            },
            tags: this.buildTags(response),
        };
        await this.memoryPort.recordDecision(trace);
    }
    toStatus(decision) {
        switch (decision) {
            case 'APPROVE':
            case 'DEBUG':
                return 'success';
            case 'REGEN':
            case 'ABORT':
                return 'failure';
        }
    }
    buildTags(response) {
        const tags = ['hitl'];
        switch (response.decision) {
            case 'APPROVE':
                tags.push('hitl:approved', 'hitl:preferred-pattern');
                break;
            case 'REGEN':
                tags.push('hitl:rejected', 'hitl:rejection-reason');
                break;
            case 'ABORT':
                tags.push('hitl:aborted');
                break;
            case 'DEBUG':
                tags.push('hitl:debug');
                break;
        }
        return tags;
    }
}
//# sourceMappingURL=audit-recorder.js.map