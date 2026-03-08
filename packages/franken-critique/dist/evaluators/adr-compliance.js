const RELEVANCE_THRESHOLD = 0.7;
const TOP_K = 5;
export class ADRComplianceEvaluator {
    name = 'adr-compliance';
    category = 'heuristic';
    memory;
    constructor(memory) {
        this.memory = memory;
    }
    async evaluate(input) {
        const query = this.extractQuery(input.content);
        const adrs = await this.memory.searchADRs(query, TOP_K);
        const findings = [];
        for (const adr of adrs) {
            if (adr.relevanceScore >= RELEVANCE_THRESHOLD) {
                findings.push({
                    message: `ADR ${adr.id} ("${adr.title}") is highly relevant (${Math.round(adr.relevanceScore * 100)}% match). Verify compliance.`,
                    severity: 'warning',
                    suggestion: `Ensure code aligns with: ${adr.content.slice(0, 120)}`,
                });
            }
        }
        const hasHighRelevance = adrs.some((a) => a.relevanceScore >= RELEVANCE_THRESHOLD);
        const score = hasHighRelevance ? 0.5 : 1;
        return {
            evaluatorName: this.name,
            verdict: findings.length === 0 ? 'pass' : 'fail',
            score,
            findings,
        };
    }
    extractQuery(content) {
        const trimmed = content.slice(0, 200).trim();
        const lastSpace = trimmed.lastIndexOf(' ');
        return lastSpace > 50 ? trimmed.slice(0, lastSpace) : trimmed;
    }
}
//# sourceMappingURL=adr-compliance.js.map