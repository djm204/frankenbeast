import type { LlmRequest } from '@franken/types';

export interface LlmResponse {
  content: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmMiddleware {
  readonly name: string;
  beforeRequest(request: LlmRequest): LlmRequest;
  afterResponse(response: LlmResponse): LlmResponse;
}

export class MiddlewareChain {
  private middlewares: LlmMiddleware[] = [];

  add(middleware: LlmMiddleware): void {
    this.middlewares.push(middleware);
  }

  remove(name: string): void {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
  }

  getMiddlewares(): readonly LlmMiddleware[] {
    return this.middlewares;
  }

  processRequest(request: LlmRequest): LlmRequest {
    let processed = request;
    for (const mw of this.middlewares) {
      processed = mw.beforeRequest(processed);
    }
    return processed;
  }

  processResponse(response: LlmResponse): LlmResponse {
    let processed = response;
    for (const mw of [...this.middlewares].reverse()) {
      processed = mw.afterResponse(processed);
    }
    return processed;
  }
}
