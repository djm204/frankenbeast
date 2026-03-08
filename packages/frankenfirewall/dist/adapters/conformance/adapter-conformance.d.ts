import type { IAdapter } from "../i-adapter.js";
import type { UnifiedRequest } from "../../types/index.js";
/**
 * Conformance check results.
 */
export interface ConformanceResult {
    passed: boolean;
    failures: string[];
}
export interface ConformanceFixtures {
    /** A simple text completion response in the provider's native format. */
    textResponse: unknown;
    /** A tool-call response in the provider's native format. */
    toolResponse: unknown;
}
/**
 * Runs the adapter conformance suite. Tests that:
 * 1. transformRequest returns a non-null value
 * 2. transformResponse produces a valid UnifiedResponse shape
 * 3. validateCapabilities returns boolean for all features
 * 4. No provider-specific fields leak into UnifiedResponse
 * 5. Tool calls are correctly normalised
 */
export declare function runAdapterConformance(factory: () => IAdapter, request: UnifiedRequest, fixtures: ConformanceFixtures): ConformanceResult;
//# sourceMappingURL=adapter-conformance.d.ts.map