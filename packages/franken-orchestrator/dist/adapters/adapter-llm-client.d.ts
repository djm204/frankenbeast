import type { ILlmClient } from '@franken/types';
type UnifiedRequest = {
    id: string;
    provider: string;
    model: string;
    system?: string;
    messages: Array<{
        role: 'user' | 'assistant' | 'tool';
        content: string;
    }>;
    tools?: Array<{
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
    }>;
    max_tokens?: number;
    session_id?: string;
};
type UnifiedResponse = {
    content: string | null;
};
export interface IAdapter {
    transformRequest(request: UnifiedRequest): unknown;
    execute(providerRequest: unknown): Promise<unknown>;
    transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;
    validateCapabilities(feature: string): boolean;
}
export declare class AdapterLlmClient implements ILlmClient {
    private readonly adapter;
    constructor(adapter: IAdapter);
    complete(prompt: string): Promise<string>;
}
export {};
//# sourceMappingURL=adapter-llm-client.d.ts.map