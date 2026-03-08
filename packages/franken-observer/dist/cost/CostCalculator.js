export class CostCalculator {
    pricing;
    constructor(pricing) {
        this.pricing = pricing;
    }
    calculate(entry) {
        const model = this.pricing[entry.model];
        if (model === undefined)
            return 0;
        return ((entry.promptTokens / 1_000_000) * model.promptPerMillion +
            (entry.completionTokens / 1_000_000) * model.completionPerMillion);
    }
    totalCost(entries) {
        return entries.reduce((sum, entry) => sum + this.calculate(entry), 0);
    }
}
//# sourceMappingURL=CostCalculator.js.map