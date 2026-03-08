import { CostCalculator } from './CostCalculator.js';
export class ModelAttribution {
    calc;
    state = new Map();
    constructor(pricing) {
        this.calc = new CostCalculator(pricing);
    }
    record(entry) {
        const existing = this.state.get(entry.model) ?? {
            totalCalls: 0,
            successfulCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
        };
        this.state.set(entry.model, {
            totalCalls: existing.totalCalls + 1,
            successfulCalls: existing.successfulCalls + (entry.success ? 1 : 0),
            promptTokens: existing.promptTokens + entry.promptTokens,
            completionTokens: existing.completionTokens + entry.completionTokens,
        });
    }
    report() {
        return Array.from(this.state.entries()).map(([model, s]) => ({
            model,
            totalCalls: s.totalCalls,
            successfulCalls: s.successfulCalls,
            failedCalls: s.totalCalls - s.successfulCalls,
            successRate: s.totalCalls === 0 ? 0 : s.successfulCalls / s.totalCalls,
            totalCostUsd: this.calc.calculate({
                model,
                promptTokens: s.promptTokens,
                completionTokens: s.completionTokens,
            }),
        }));
    }
}
//# sourceMappingURL=ModelAttribution.js.map