import type { LlmRequest } from '@franken/types';
import type { LlmMiddleware, LlmResponse } from './llm-middleware.js';
import type { SecurityRule } from './security-profiles.js';

export class CustomRuleError extends Error {
  constructor(
    public readonly ruleName: string,
    public readonly matchedPattern: string,
  ) {
    super(`Custom security rule "${ruleName}" violated: pattern ${matchedPattern}`);
    this.name = 'CustomRuleError';
  }
}

export class CustomRuleMiddleware implements LlmMiddleware {
  readonly name: string;
  private readonly pattern: RegExp;
  private readonly rule: SecurityRule;

  constructor(rule: SecurityRule) {
    this.name = `custom:${rule.name}`;
    this.pattern = new RegExp(rule.pattern, 'i');
    this.rule = rule;
  }

  beforeRequest(request: LlmRequest): LlmRequest {
    if (this.rule.target === 'response') return request;

    for (const msg of request.messages) {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .map((b) => ('text' in b ? (b as { text: string }).text : ''))
              .join(' ');

      if (this.pattern.test(text)) {
        if (this.rule.action === 'block') {
          throw new CustomRuleError(this.rule.name, this.rule.pattern);
        }
        // warn/log: no-op in middleware (caller handles logging)
      }
    }
    return request;
  }

  afterResponse(response: LlmResponse): LlmResponse {
    if (this.rule.target === 'request') return response;

    if (this.pattern.test(response.content)) {
      if (this.rule.action === 'block') {
        throw new CustomRuleError(this.rule.name, this.rule.pattern);
      }
    }
    return response;
  }
}
