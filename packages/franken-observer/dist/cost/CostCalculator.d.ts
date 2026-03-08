import type { PricingTable } from './defaultPricing.js';
import type { TokenRecord } from './TokenCounter.js';
export declare class CostCalculator {
    private readonly pricing;
    constructor(pricing: PricingTable);
    calculate(entry: TokenRecord): number;
    totalCost(entries: TokenRecord[]): number;
}
//# sourceMappingURL=CostCalculator.d.ts.map