export interface ModelPricing {
    /** USD per 1,000,000 prompt tokens */
    promptPerMillion: number;
    /** USD per 1,000,000 completion tokens */
    completionPerMillion: number;
}
export type PricingTable = Record<string, ModelPricing>;
/**
 * Default pricing table (USD, as of 2025-Q4).
 * Override by passing your own PricingTable to CostCalculator.
 */
export declare const DEFAULT_PRICING: PricingTable;
//# sourceMappingURL=defaultPricing.d.ts.map