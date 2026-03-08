import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";
type OpenAIRole = "system" | "user" | "assistant" | "tool";
interface OpenAIMessage {
    role: OpenAIRole;
    content: string | null;
    tool_call_id?: string;
    tool_calls?: OpenAIToolCall[];
}
interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}
interface OpenAIFunction {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
interface OpenAITool {
    type: "function";
    function: OpenAIFunction;
}
interface OpenAIRequest {
    model: string;
    messages: OpenAIMessage[];
    tools?: OpenAITool[];
    max_tokens?: number;
}
export interface OpenAIAdapterConfig {
    apiKey: string;
    model: string;
    apiBaseUrl?: string;
}
export declare class OpenAIAdapter extends BaseAdapter implements IAdapter {
    private readonly model;
    private readonly apiKey;
    private readonly apiBaseUrl;
    constructor(adapterConfig: OpenAIAdapterConfig);
    validateCapabilities(feature: CapabilityFeature): boolean;
    transformRequest(request: UnifiedRequest): OpenAIRequest;
    execute(providerRequest: unknown): Promise<unknown>;
    transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
}
export {};
//# sourceMappingURL=openai-adapter.d.ts.map