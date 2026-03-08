import type { PricingTable } from './defaultPricing.js';
export interface AttributionEntry {
    model: string;
    promptTokens: number;
    completionTokens: number;
    success: boolean;
}
export interface AttributionRow {
    model: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: number;
    totalCostUsd: number;
}
export declare class ModelAttribution {
    private readonly calc;
    private readonly state;
    constructor(pricing: PricingTable);
    record(entry: AttributionEntry): void;
    report(): AttributionRow[];
}
//# sourceMappingURL=ModelAttribution.d.ts.map