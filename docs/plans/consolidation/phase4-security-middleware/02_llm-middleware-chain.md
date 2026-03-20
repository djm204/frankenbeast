# Chunk 4.2: LLM Middleware Chain

**Phase:** 4 — Security Middleware
**Depends on:** Chunk 4.1 (patterns extracted)
**Estimated size:** Medium (~200 lines + tests)

---

## Purpose

Implement the `LlmMiddleware` interface and three concrete middleware classes that run before and after every LLM call via the `ProviderRegistry`.

## Implementation

### Middleware Interface

```typescript
// packages/franken-orchestrator/src/middleware/llm-middleware.ts

import type { LlmRequest } from '@frankenbeast/types';

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
    this.middlewares = this.middlewares.filter(m => m.name !== name);
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
    // Reverse order for response processing (like middleware stacks)
    for (const mw of [...this.middlewares].reverse()) {
      processed = mw.afterResponse(processed);
    }
    return processed;
  }
}
```

### Injection Detection Middleware

```typescript
// packages/franken-orchestrator/src/middleware/injection-detection.ts

export class InjectionDetectionMiddleware implements LlmMiddleware {
  readonly name = 'injection-detection';

  private patterns: RegExp[] = [
    // Common prompt injection patterns (from firewall extraction)
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*:\s*/i,
    /\[INST\]/i,
    /<<SYS>>/i,
    /\bDAN\b.*\bmode\b/i,
    /jailbreak/i,
    // Base64-encoded injection attempts
    /aWdub3Jl/,  // base64 for "ignore"
  ];

  beforeRequest(request: LlmRequest): LlmRequest {
    // Scan all message content for injection patterns
    for (const message of request.messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : message.content.map(b => 'text' in b ? b.text : '').join(' ');

      for (const pattern of this.patterns) {
        if (pattern.test(content)) {
          throw new InjectionDetectedError(
            `Potential prompt injection detected: ${pattern.source}`,
            pattern.source,
          );
        }
      }
    }
    return request;
  }

  afterResponse(response: LlmResponse): LlmResponse {
    return response;  // No output-side injection detection
  }
}

export class InjectionDetectedError extends Error {
  constructor(message: string, public readonly pattern: string) {
    super(message);
    this.name = 'InjectionDetectedError';
  }
}
```

### PII Masking Middleware

```typescript
// packages/franken-orchestrator/src/middleware/pii-masking.ts

export class PiiMaskingMiddleware implements LlmMiddleware {
  readonly name = 'pii-masking';

  private rules: Array<{ name: string; pattern: RegExp; replacement: string }> = [
    { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
    { name: 'phone-us', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
    { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
    { name: 'credit-card', pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: '[CARD]' },
    { name: 'ip-address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  ];

  beforeRequest(request: LlmRequest): LlmRequest {
    // Mask PII in user messages before sending to LLM
    return {
      ...request,
      messages: request.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string'
          ? this.mask(m.content)
          : m.content.map(b => 'text' in b ? { ...b, text: this.mask(b.text) } : b),
      })),
    };
  }

  afterResponse(response: LlmResponse): LlmResponse {
    // Also mask PII in LLM output (it may echo back sensitive data)
    return {
      ...response,
      content: this.mask(response.content),
    };
  }

  private mask(text: string): string {
    let result = text;
    for (const rule of this.rules) {
      result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
  }
}
```

### Output Validation Middleware

```typescript
// packages/franken-orchestrator/src/middleware/output-validation.ts

export class OutputValidationMiddleware implements LlmMiddleware {
  readonly name = 'output-validation';

  constructor(private options: {
    maxResponseLength?: number;  // default: 100_000 chars
  } = {}) {}

  beforeRequest(request: LlmRequest): LlmRequest {
    return request;  // No input-side validation (handled by injection detection)
  }

  afterResponse(response: LlmResponse): LlmResponse {
    const maxLen = this.options.maxResponseLength ?? 100_000;

    if (response.content.length > maxLen) {
      return {
        ...response,
        content: response.content.slice(0, maxLen) + '\n[TRUNCATED: response exceeded maximum length]',
      };
    }
    return response;
  }
}
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/middleware/

// middleware-chain.test.ts
describe('MiddlewareChain', () => {
  it('runs beforeRequest in order', () => { ... });
  it('runs afterResponse in reverse order', () => { ... });
  it('add/remove middleware by name', () => { ... });
  it('propagates errors from middleware', () => { ... });
});

// injection-detection.test.ts
describe('InjectionDetectionMiddleware', () => {
  it('blocks "ignore all previous instructions"', () => { ... });
  it('blocks "you are now a..."', () => { ... });
  it('blocks [INST] tags', () => { ... });
  it('blocks <<SYS>> tags', () => { ... });
  it('blocks DAN mode references', () => { ... });
  it('blocks base64-encoded injections', () => { ... });
  it('allows normal conversation', () => { ... });
  it('throws InjectionDetectedError with pattern info', () => { ... });
  it('scans all messages in request', () => { ... });
  it('handles content block arrays', () => { ... });
});

// pii-masking.test.ts
describe('PiiMaskingMiddleware', () => {
  it('masks email addresses', () => { ... });
  it('masks US phone numbers', () => { ... });
  it('masks SSN', () => { ... });
  it('masks credit card numbers', () => { ... });
  it('masks IP addresses', () => { ... });
  it('masks PII in both request and response', () => { ... });
  it('handles multiple PII types in same text', () => { ... });
  it('preserves non-PII text', () => { ... });
});

// output-validation.test.ts
describe('OutputValidationMiddleware', () => {
  it('passes normal responses through', () => { ... });
  it('truncates oversized responses', () => { ... });
  it('appends truncation notice', () => { ... });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/middleware/llm-middleware.ts`
- **Add:** `packages/franken-orchestrator/src/middleware/injection-detection.ts`
- **Add:** `packages/franken-orchestrator/src/middleware/pii-masking.ts`
- **Add:** `packages/franken-orchestrator/src/middleware/output-validation.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/middleware-chain.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/injection-detection.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/pii-masking.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/output-validation.test.ts`

## Exit Criteria

- `LlmMiddleware` interface defined with `beforeRequest`/`afterResponse`
- `MiddlewareChain` runs middleware in order (forward for request, reverse for response)
- Injection detection catches common prompt injection patterns
- PII masking redacts emails, phones, SSNs, credit cards, IPs
- Output validation truncates oversized responses
- All unit tests pass
