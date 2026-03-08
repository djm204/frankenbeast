import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";
export interface GeminiAdapterConfig {
    apiKey: string;
    model: string;
}
export declare class GeminiAdapter extends BaseAdapter implements IAdapter {
    constructor(config: GeminiAdapterConfig);
    validateCapabilities(_feature: CapabilityFeature): boolean;
    transformRequest(_request: UnifiedRequest): unknown;
    execute(_providerRequest: unknown): Promise<unknown>;
    transformResponse(_providerResponse: unknown, _requestId: string): UnifiedResponse;
}
//# sourceMappingURL=gemini-adapter.d.ts.map