const RELEVANCE_THRESHOLD = 0.7;
const TOP_K = 5;
export class FactualityEvaluator {
    name = 'factuality';
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
                    message: `ADR "${adr.title}" (${adr.id}) may be relevant — review for factual alignment (relevance: ${Math.round(adr.relevanceScore * 100)}%)`,
                    severity: 'info',
                    suggestion: `Verify content aligns with: ${adr.content.slice(0, 100)}...`,
                });
            }
        }
        const score = findings.length === 0 ? 1 : Math.max(0.3, 1 - findings.length * 0.15);
        return {
            evaluatorName: this.name,
            verdict: 'pass',
            score,
            findings,
        };
    }
    extractQuery(content) {
        // Take the first 200 chars as a search query, trimmed to word boundaries
        const trimmed = content.slice(0, 200).trim();
        const lastSpace = trimmed.lastIndexOf(' ');
        return lastSpace > 50 ? trimmed.slice(0, lastSpace) : trimmed;
    }
}
//# sourceMappingURL=factuality.js.map