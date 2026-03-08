export class SafetyEvaluator {
    name = 'safety';
    category = 'deterministic';
    guardrails;
    constructor(guardrails) {
        this.guardrails = guardrails;
    }
    async evaluate(input) {
        const rules = await this.guardrails.getSafetyRules();
        const findings = [];
        let hasBlock = false;
        for (const rule of rules) {
            const regex = new RegExp(rule.pattern, 'g');
            if (regex.test(input.content)) {
                const isBlock = rule.severity === 'block';
                if (isBlock)
                    hasBlock = true;
                findings.push({
                    message: `Safety rule violated: ${rule.description}`,
                    severity: isBlock ? 'critical' : 'warning',
                    suggestion: `Remove or refactor code matching pattern: ${rule.pattern}`,
                });
            }
        }
        const warningCount = findings.filter((f) => f.severity === 'warning').length;
        const score = hasBlock ? 0 : warningCount > 0 ? Math.max(0, 1 - warningCount * 0.2) : 1;
        return {
            evaluatorName: this.name,
            verdict: hasBlock ? 'fail' : 'pass',
            score,
            findings,
        };
    }
}
//# sourceMappingURL=safety.js.map