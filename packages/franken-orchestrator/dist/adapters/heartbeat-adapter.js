export class HeartbeatPortAdapter {
    pulseOrchestrator;
    constructor(deps) {
        this.pulseOrchestrator = deps.pulseOrchestrator;
    }
    async pulse() {
        try {
            const report = await this.pulseOrchestrator.run();
            const improvements = report.reflection?.improvements.map(i => i.description) ?? [];
            const techDebt = report.reflection?.techDebt.map(td => `${td.location}: ${td.description}`) ?? [];
            return {
                improvements,
                techDebt,
                summary: buildSummary(report.pulseResult, improvements.length),
            };
        }
        catch (error) {
            throw new Error(`HeartbeatPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
    }
}
function buildSummary(pulseResult, improvementCount) {
    if (pulseResult.status === 'HEARTBEAT_OK') {
        return 'Heartbeat OK';
    }
    const count = pulseResult.flags.length;
    const improvementSuffix = improvementCount > 0 ? ` with ${improvementCount} improvements` : '';
    return `Heartbeat flags found (${count})${improvementSuffix}`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=heartbeat-adapter.js.map