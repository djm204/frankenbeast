/**
 * Mutable context that flows through all Beast Loop phases.
 * Each phase reads and writes to this shared state.
 */
export class BeastContext {
    projectId;
    sessionId;
    userInput;
    sanitizedIntent;
    plan;
    phase = 'ingestion';
    tokenSpend = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
    };
    audit = [];
    startTime;
    constructor(projectId, sessionId, userInput) {
        this.projectId = projectId;
        this.sessionId = sessionId;
        this.userInput = userInput;
        this.startTime = Date.now();
    }
    /** Append an audit entry. */
    addAudit(module, action, detail) {
        this.audit.push({
            timestamp: new Date().toISOString(),
            module,
            action,
            detail,
        });
    }
    /** Elapsed time since context creation. */
    elapsedMs() {
        return Date.now() - this.startTime;
    }
}
//# sourceMappingURL=franken-context.js.map