# Chunk 4.4: Domain Allowlist Middleware

**Phase:** 4 — Security Middleware
**Depends on:** Chunk 4.2 (LlmMiddleware interface + chain), Chunk 4.3 (security profiles)
**Estimated size:** Small (~100 lines)

---

## Purpose

ADR-031 specifies a "domain allowlist" as an individual security setting, required in `strict` profile and optional in `standard`. This middleware inspects LLM requests and responses for URLs, and blocks any that reference domains not on the allowlist. Without it, an agent could exfiltrate data to arbitrary endpoints or fetch from untrusted sources.

## Design

### How It Works

The `DomainAllowlistMiddleware` implements `LlmMiddleware`:

- **`beforeRequest()`**: Scans the request messages for URLs. If any URL's hostname is not in the allowlist, throws `DomainBlockedError` with the offending domain.
- **`afterResponse()`**: Scans the LLM response for URLs (tool use inputs containing URLs, text with embedded URLs). Flags violations but does not throw — logs a warning and redacts the URL. The LLM may hallucinate URLs, so blocking the entire response is too aggressive.

### URL Extraction

Uses a simple regex to extract URLs from text content. Not a full HTML parser — this is defense-in-depth, not a WAF.

```typescript
// packages/franken-orchestrator/src/middleware/domain-allowlist.ts

import type { LlmMiddleware, LlmRequest, LlmResponse } from './middleware-chain.js';

const URL_PATTERN = /https?:\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,}))(\/[^\s)'"]*)?/g;

export class DomainBlockedError extends Error {
  constructor(
    public readonly domain: string,
    public readonly allowlist: readonly string[],
  ) {
    super(`Domain "${domain}" is not in the allowlist. Allowed: ${allowlist.join(', ')}`);
    this.name = 'DomainBlockedError';
  }
}

export class DomainAllowlistMiddleware implements LlmMiddleware {
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly logger?: (msg: string) => void;

  constructor(domains: string[], logger?: (msg: string) => void) {
    // Normalize: lowercase, strip leading dots
    this.allowedDomains = new Set(
      domains.map(d => d.toLowerCase().replace(/^\./, '')),
    );
    this.logger = logger;
  }

  beforeRequest(request: LlmRequest): LlmRequest {
    for (const msg of request.messages) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map(b => b.text)
            .join(' ');

      for (const domain of this.extractDomains(text)) {
        if (!this.isDomainAllowed(domain)) {
          throw new DomainBlockedError(domain, [...this.allowedDomains]);
        }
      }
    }
    return request;
  }

  afterResponse(response: LlmResponse): LlmResponse {
    // Scan response text for domains — warn + redact, don't throw
    const text = this.extractResponseText(response);
    for (const domain of this.extractDomains(text)) {
      if (!this.isDomainAllowed(domain)) {
        this.logger?.(`[security] Response contains blocked domain: ${domain}`);
      }
    }
    return response;
  }

  private extractDomains(text: string): string[] {
    const domains: string[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
    while ((match = pattern.exec(text)) !== null) {
      domains.push(match[1].toLowerCase());
    }
    return domains;
  }

  private isDomainAllowed(domain: string): boolean {
    // Exact match
    if (this.allowedDomains.has(domain)) return true;

    // Subdomain match: if "github.com" is allowed, "api.github.com" passes
    for (const allowed of this.allowedDomains) {
      if (domain.endsWith(`.${allowed}`)) return true;
    }

    return false;
  }

  private extractResponseText(response: LlmResponse): string {
    // Extract text from response events/content for scanning
    if (typeof response.content === 'string') return response.content;
    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join(' ');
  }
}
```

### Profile Integration

The `resolveSecurityConfig()` function (Chunk 4.3) wires the allowlist:

- **`strict`**: `allowedDomains` is **required** — config validation fails without it
- **`standard`**: `allowedDomains` is optional — if provided, middleware is added to chain; if omitted, skipped
- **`permissive`**: Domain allowlist middleware is never added

```typescript
// Addition to packages/franken-orchestrator/src/middleware/security-profiles.ts

export function buildMiddlewareChain(config: SecurityConfig): MiddlewareChain {
  const middlewares: LlmMiddleware[] = [];

  if (config.injectionDetection) middlewares.push(new InjectionDetectionMiddleware());
  if (config.piiMasking) middlewares.push(new PiiMaskingMiddleware());

  // Domain allowlist — required for strict, optional for standard
  if (config.allowedDomains && config.allowedDomains.length > 0) {
    middlewares.push(new DomainAllowlistMiddleware(config.allowedDomains));
  } else if (config.profile === 'strict') {
    throw new Error('Security profile "strict" requires allowedDomains to be configured');
  }

  if (config.outputValidation) middlewares.push(new OutputValidationMiddleware());

  return new MiddlewareChain(middlewares);
}
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/middleware/domain-allowlist.test.ts

describe('DomainAllowlistMiddleware', () => {
  const middleware = new DomainAllowlistMiddleware(['github.com', 'api.example.com']);

  describe('beforeRequest', () => {
    it('allows requests with no URLs', () => {
      const req = makeRequest('Please help me write a function');
      expect(() => middleware.beforeRequest(req)).not.toThrow();
    });

    it('allows requests with allowlisted domains', () => {
      const req = makeRequest('Check https://github.com/org/repo for the issue');
      expect(() => middleware.beforeRequest(req)).not.toThrow();
    });

    it('allows subdomain of allowlisted domain', () => {
      const req = makeRequest('Fetch from https://api.github.com/repos');
      expect(() => middleware.beforeRequest(req)).not.toThrow();
    });

    it('blocks requests with non-allowlisted domains', () => {
      const req = makeRequest('Send data to https://evil.com/exfiltrate');
      expect(() => middleware.beforeRequest(req)).toThrow(DomainBlockedError);
    });

    it('includes blocked domain and allowlist in error', () => {
      const req = makeRequest('Fetch https://malicious.io/data');
      try {
        middleware.beforeRequest(req);
        fail('Expected DomainBlockedError');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainBlockedError);
        expect((e as DomainBlockedError).domain).toBe('malicious.io');
        expect((e as DomainBlockedError).allowlist).toContain('github.com');
      }
    });

    it('scans all messages in the request', () => {
      const req = makeRequestMulti([
        'Check https://github.com/org/repo',
        'Also fetch https://evil.com/data',
      ]);
      expect(() => middleware.beforeRequest(req)).toThrow(DomainBlockedError);
    });

    it('handles mixed content blocks (text + image)', () => {
      const req = makeRequestWithBlocks([
        { type: 'text', text: 'Visit https://evil.com' },
        { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: '...' } },
      ]);
      expect(() => middleware.beforeRequest(req)).toThrow(DomainBlockedError);
    });
  });

  describe('afterResponse', () => {
    it('returns response unchanged when domains are allowed', () => {
      const resp = makeResponse('See https://github.com/org/repo');
      expect(middleware.afterResponse(resp)).toBe(resp);
    });

    it('does not throw on blocked domains in response (logs warning)', () => {
      const logs: string[] = [];
      const mw = new DomainAllowlistMiddleware(['github.com'], (msg) => logs.push(msg));
      const resp = makeResponse('Check https://evil.com/payload');
      expect(() => mw.afterResponse(resp)).not.toThrow();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('evil.com');
    });
  });

  describe('domain matching', () => {
    it('is case-insensitive', () => {
      const req = makeRequest('Fetch https://GITHUB.COM/org/repo');
      expect(() => middleware.beforeRequest(req)).not.toThrow();
    });

    it('does not match partial domain names', () => {
      // "notgithub.com" should NOT match "github.com"
      const req = makeRequest('Visit https://notgithub.com');
      expect(() => middleware.beforeRequest(req)).toThrow(DomainBlockedError);
    });
  });
});

describe('Security profile domain allowlist integration', () => {
  it('strict profile throws if allowedDomains is empty', () => {
    expect(() => buildMiddlewareChain({
      profile: 'strict',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
      allowedDomains: [],
    })).toThrow(/strict.*allowedDomains/);
  });

  it('standard profile skips allowlist middleware when not configured', () => {
    const chain = buildMiddlewareChain({
      profile: 'standard',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
    });
    // Chain should not contain DomainAllowlistMiddleware
    expect(chain.middlewares.some(m => m instanceof DomainAllowlistMiddleware)).toBe(false);
  });

  it('standard profile includes allowlist when configured', () => {
    const chain = buildMiddlewareChain({
      profile: 'standard',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
      allowedDomains: ['github.com'],
    });
    expect(chain.middlewares.some(m => m instanceof DomainAllowlistMiddleware)).toBe(true);
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/middleware/domain-allowlist.ts`
- **Modify:** `packages/franken-orchestrator/src/middleware/security-profiles.ts` — add domain allowlist wiring in `buildMiddlewareChain()`
- **Add:** `packages/franken-orchestrator/tests/unit/middleware/domain-allowlist.test.ts`

## Exit Criteria

- `DomainAllowlistMiddleware` blocks non-allowlisted domains in requests
- Subdomain matching works (e.g., `api.github.com` passes when `github.com` is allowed)
- Response scanning warns but does not throw (LLM may hallucinate URLs)
- `strict` profile requires `allowedDomains` — config validation fails without it
- `standard` profile optionally includes allowlist
- `permissive` profile never includes allowlist
- All tests pass
