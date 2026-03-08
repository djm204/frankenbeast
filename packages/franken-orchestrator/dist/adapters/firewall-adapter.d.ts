import type { IFirewallModule, FirewallResult } from '../deps.js';
export interface FirewallUnifiedRequest {
    id: string;
    provider: string;
    model: string;
    system?: string | undefined;
    messages: {
        role: 'user' | 'assistant' | 'tool';
        content: string | unknown;
    }[];
    tools?: unknown[];
    max_tokens?: number;
    session_id?: string;
}
export interface FirewallUnifiedResponse {
    id: string;
    model_used: string;
    content: string | null;
    tool_calls: unknown[];
    finish_reason: 'stop' | 'tool_use' | 'length' | 'content_filter';
    usage: {
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
    };
    schema_version: number;
}
export interface GuardrailViolation {
    code: string;
    message: string;
    interceptor: string;
}
export interface FirewallPipelineResult {
    response: FirewallUnifiedResponse;
    violations: GuardrailViolation[];
}
export interface FirewallAdapterPort {
    transformRequest(request: FirewallUnifiedRequest): unknown;
    execute(providerRequest: unknown): Promise<unknown>;
    transformResponse(providerResponse: unknown, requestId: string): FirewallUnifiedResponse;
    validateCapabilities(feature: string): boolean;
}
export interface FirewallPortAdapterDeps {
    runPipeline: (request: FirewallUnifiedRequest, adapter: FirewallAdapterPort, config: unknown, options?: unknown) => Promise<FirewallPipelineResult>;
    adapter: FirewallAdapterPort;
    config: unknown;
    options?: unknown;
    provider: string;
    model: string;
    systemPrompt?: string;
    idFactory?: () => string;
    requestFactory?: (input: string, requestId: string) => FirewallUnifiedRequest;
}
export declare class FirewallPortAdapter implements IFirewallModule {
    private readonly deps;
    constructor(deps: FirewallPortAdapterDeps);
    runPipeline(input: string): Promise<FirewallResult>;
    private defaultRequest;
    private mapViolations;
}
//# sourceMappingURL=firewall-adapter.d.ts.map