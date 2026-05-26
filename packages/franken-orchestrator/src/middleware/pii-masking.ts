import type { LlmRequest } from '@franken/types';
import type { LlmMiddleware, LlmResponse } from './llm-middleware.js';

/**
 * PII patterns from the original frankenfirewall (v0.pre-consolidation), plus
 * narrowly scoped secret patterns that commonly appear in prompts and logs.
 * Credit card regex validates Visa/MC/Amex/Discover prefixes.
 * SSN regex excludes invalid prefixes (000, 666, 9xx).
 */
const PII_RULES: Array<{
  name: string;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    name: 'database-connection-string',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s'"`<>]+/gi,
    replacement: '[CONNECTION_STRING]',
  },
  {
    name: 'api-key-or-token',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|(?:ghp|gho)_[A-Za-z0-9_]{20,}|xoxb-(?:\d{10,}-){2}[A-Za-z0-9-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,})\b/g,
    replacement: '[API_KEY]',
  },
  {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },
  {
    name: 'credit-card',
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})(?:[\s\-]?[0-9]{4})*\b/g,
    replacement: '[CC]',
  },
  {
    name: 'ssn',
    pattern: /\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/g,
    replacement: '[SSN]',
  },
  {
    name: 'phone-us',
    pattern:
      /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]\d{4}\b/g,
    replacement: '[PHONE]',
  },
  {
    name: 'ip-address',
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: '[IP]',
  },
];

function mask(text: string): string {
  let result = text;
  for (const rule of PII_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

export class PiiMaskingMiddleware implements LlmMiddleware {
  readonly name = 'pii-masking';

  beforeRequest(request: LlmRequest): LlmRequest {
    return {
      ...request,
      messages: request.messages.map((m) => ({
        ...m,
        content:
          typeof m.content === 'string'
            ? mask(m.content)
            : m.content.map((b) =>
                'text' in b
                  ? { ...b, text: mask((b as { text: string }).text) }
                  : b,
              ),
      })),
    };
  }

  afterResponse(response: LlmResponse): LlmResponse {
    return { ...response, content: mask(response.content) };
  }
}
