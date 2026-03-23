import type { LlmRequest } from '@franken/types';
import type { LlmMiddleware, LlmResponse } from './llm-middleware.js';

export interface OutputValidationOptions {
  maxResponseLength?: number;
}

export class OutputValidationMiddleware implements LlmMiddleware {
  readonly name = 'output-validation';
  private readonly maxLen: number;

  constructor(options: OutputValidationOptions = {}) {
    this.maxLen = options.maxResponseLength ?? 100_000;
  }

  beforeRequest(request: LlmRequest): LlmRequest {
    return request;
  }

  afterResponse(response: LlmResponse): LlmResponse {
    if (response.content.length > this.maxLen) {
      return {
        ...response,
        content:
          response.content.slice(0, this.maxLen) +
          '\n[TRUNCATED: response exceeded maximum length]',
      };
    }
    return response;
  }
}
