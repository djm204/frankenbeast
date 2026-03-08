import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";
interface ClaudeMessage {
    role: "user" | "assistant";
    content: string | ClaudeContentBlock[];
}
interface ClaudeTextBlock {
    type: "text";
    text: string;
}
interface ClaudeToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
}
type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;
interface ClaudeToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
interface ClaudeRequest {
    model: string;
    max_tokens: number;
    system?: string;
    messages: ClaudeMessage[];
    tools?: ClaudeToolDefinition[];
}
export interface ClaudeAdapterConfig {
    apiKey: string;
    model: string;
    apiBaseUrl?: string;
}
export declare class ClaudeAdapter extends BaseAdapter implements IAdapter {
    private readonly model;
    private readonly apiKey;
    private readonly apiBaseUrl;
    constructor(adapterConfig: ClaudeAdapterConfig);
    validateCapabilities(feature: CapabilityFeature): boolean;
    transformRequest(request: UnifiedRequest): ClaudeRequest;
    execute(providerRequest: unknown): Promise<unknown>;
    transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
}
export {};
//# sourceMappingURL=claude-adapter.d.ts.map