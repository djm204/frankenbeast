import { randomUUID } from 'node:crypto';
import type { IFirewallModule, FirewallResult, FirewallViolation } from '../deps.js';

export interface FirewallUnifiedRequest {
  id: string;
  provider: string;
  model: string;
  system?: string | undefined;
  messages: { role: 'user' | 'assistant' | 'tool'; content: string | unknown }[];
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
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
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
  runPipeline: (
    request: FirewallUnifiedRequest,
    adapter: FirewallAdapterPort,
    config: unknown,
    options?: unknown,
  ) => Promise<FirewallPipelineResult>;
  adapter: FirewallAdapterPort;
  config: unknown;
  options?: unknown;
  provider: string;
  model: string;
  systemPrompt?: string;
  idFactory?: () => string;
  requestFactory?: (input: string, requestId: string) => FirewallUnifiedRequest;
}

export class FirewallPortAdapter implements IFirewallModule {
  private readonly deps: FirewallPortAdapterDeps;

  constructor(deps: FirewallPortAdapterDeps) {
    this.deps = deps;
  }

  async runPipeline(input: string): Promise<FirewallResult> {
    const requestId = this.deps.idFactory?.() ?? randomUUID();
    const request =
      this.deps.requestFactory?.(input, requestId) ??
      this.defaultRequest(input, requestId);

    try {
      const result = await this.deps.runPipeline(
        request,
        this.deps.adapter,
        this.deps.config,
        this.deps.options,
      );

      const blocked = result.response.finish_reason === 'content_filter';
      const sanitizedText = typeof result.response.content === 'string'
        ? result.response.content
        : '';

      return {
        sanitizedText,
        blocked,
        violations: this.mapViolations(result.violations, blocked),
      };
    } catch (error) {
      throw new Error(`FirewallPortAdapter failed: ${errorMessage(error)}`, { cause: error });
    }
  }

  private defaultRequest(input: string, requestId: string): FirewallUnifiedRequest {
    return {
      id: requestId,
      provider: this.deps.provider,
      model: this.deps.model,
      system: this.deps.systemPrompt,
      messages: [{ role: 'user', content: input }],
    };
  }

  private mapViolations(
    violations: GuardrailViolation[],
    blocked: boolean,
  ): FirewallViolation[] {
    const severity = blocked ? 'block' : 'warn';
    return violations.map(v => ({
      rule: v.code,
      severity,
      detail: v.message,
    }));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
