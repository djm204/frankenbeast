export class AuditLogger {
    write;
    constructor(options = {}) {
        this.write = options.write ?? ((entry) => process.stdout.write(JSON.stringify(entry) + "\n"));
    }
    log(entry) {
        this.write(entry);
    }
    buildEntry(params) {
        const interceptors_run = [
            "InjectionScanner",
            "PiiMasker",
            "ProjectAlignmentChecker",
            ...(params.violations.length === 0
                ? ["SchemaEnforcer", "DeterministicGrounder", "HallucinationScraper"]
                : []),
        ];
        return {
            timestamp: new Date().toISOString(),
            request_id: params.requestId,
            provider: params.provider,
            model: params.model,
            ...(params.sessionId ? { session_id: params.sessionId } : {}),
            interceptors_run,
            violations: params.violations,
            outcome: params.violations.length === 0 ? "pass" : "blocked",
            input_tokens: params.inputTokens,
            output_tokens: params.outputTokens,
            cost_usd: params.costUsd,
            duration_ms: Date.now() - params.startedAt,
        };
    }
}
//# sourceMappingURL=audit-logger.js.map