import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";
interface OllamaMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
interface OllamaRequest {
    model: string;
    messages: OllamaMessage[];
    stream: false;
    options?: {
        num_predict?: number;
    };
}
export interface OllamaAdapterConfig {
    model: string;
    baseUrl?: string;
}
export declare class OllamaAdapter extends BaseAdapter implements IAdapter {
    private readonly model;
    private readonly baseUrl;
    constructor(config: OllamaAdapterConfig);
    validateCapabilities(feature: CapabilityFeature): boolean;
    transformRequest(request: UnifiedRequest): OllamaRequest;
    execute(providerRequest: unknown): Promise<unknown>;
    transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
}
export {};
//# sourceMappingURL=ollama-adapter.d.ts.map