import { randomUUID } from 'node:crypto';
export class FirewallPortAdapter {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async runPipeline(input) {
        const requestId = this.deps.idFactory?.() ?? randomUUID();
        const request = this.deps.requestFactory?.(input, requestId) ??
            this.defaultRequest(input, requestId);
        try {
            const result = await this.deps.runPipeline(request, this.deps.adapter, this.deps.config, this.deps.options);
            const blocked = result.response.finish_reason === 'content_filter';
            const sanitizedText = typeof result.response.content === 'string'
                ? result.response.content
                : '';
            return {
                sanitizedText,
                blocked,
                violations: this.mapViolations(result.violations, blocked),
            };
        }
        catch (error) {
            throw new Error(`FirewallPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
    }
    defaultRequest(input, requestId) {
        return {
            id: requestId,
            provider: this.deps.provider,
            model: this.deps.model,
            system: this.deps.systemPrompt,
            messages: [{ role: 'user', content: input }],
        };
    }
    mapViolations(violations, blocked) {
        const severity = blocked ? 'block' : 'warn';
        return violations.map(v => ({
            rule: v.code,
            severity,
            detail: v.message,
        }));
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=firewall-adapter.js.map