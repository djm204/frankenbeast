import { describe, it, expect } from 'vitest';
import type { LlmRequest } from '@franken/types';
import {
  DomainAllowlistMiddleware,
  DomainBlockedError,
} from '../../../src/middleware/domain-allowlist.js';
import type { LlmResponse } from '../../../src/middleware/llm-middleware.js';
import {
  buildMiddlewareChain,
  resolveSecurityConfig,
} from '../../../src/middleware/security-profiles.js';

function makeRequest(content: string): LlmRequest {
  return { systemPrompt: '', messages: [{ role: 'user', content }] };
}

function makeMultiMessage(...contents: string[]): LlmRequest {
  return {
    systemPrompt: '',
    messages: contents.map((c) => ({ role: 'user' as const, content: c })),
  };
}

function makeResponse(content: string): LlmResponse {
  return { content, usage: { inputTokens: 10, outputTokens: 5 } };
}

const mw = new DomainAllowlistMiddleware(['github.com', 'api.example.com']);

describe('DomainAllowlistMiddleware', () => {
  describe('beforeRequest', () => {
    it('allows requests with no URLs', () => {
      expect(() =>
        mw.beforeRequest(makeRequest('Please help me write a function')),
      ).not.toThrow();
    });

    it('allows requests with allowlisted domains', () => {
      expect(() =>
        mw.beforeRequest(
          makeRequest('Check https://github.com/org/repo for the issue'),
        ),
      ).not.toThrow();
    });

    it('allows subdomain of allowlisted domain', () => {
      expect(() =>
        mw.beforeRequest(
          makeRequest('Fetch from https://api.github.com/repos'),
        ),
      ).not.toThrow();
    });

    it('blocks requests with non-allowlisted domains', () => {
      expect(() =>
        mw.beforeRequest(
          makeRequest('Send data to https://evil.com/exfiltrate'),
        ),
      ).toThrow(DomainBlockedError);
    });

    it('includes blocked domain and allowlist in error', () => {
      try {
        mw.beforeRequest(makeRequest('Fetch https://malicious.io/data'));
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainBlockedError);
        expect((e as DomainBlockedError).domain).toBe('malicious.io');
        expect((e as DomainBlockedError).allowlist).toContain('github.com');
      }
    });

    it('scans all messages in the request', () => {
      expect(() =>
        mw.beforeRequest(
          makeMultiMessage(
            'Check https://github.com/org/repo',
            'Also fetch https://evil.com/data',
          ),
        ),
      ).toThrow(DomainBlockedError);
    });

    it('handles mixed content blocks (text + image)', () => {
      const req: LlmRequest = {
        systemPrompt: '',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Visit https://evil.com' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  mediaType: 'image/png',
                  data: '...',
                },
              },
            ],
          },
        ],
      };
      expect(() => mw.beforeRequest(req)).toThrow(DomainBlockedError);
    });
  });

  describe('afterResponse', () => {
    it('returns response unchanged when domains are allowed', () => {
      const resp = makeResponse('See https://github.com/org/repo');
      expect(mw.afterResponse(resp)).toBe(resp);
    });

    it('does not throw on blocked domains in response (logs warning)', () => {
      const logs: string[] = [];
      const logMw = new DomainAllowlistMiddleware(['github.com'], (msg) =>
        logs.push(msg),
      );
      const resp = makeResponse('Check https://evil.com/payload');
      expect(() => logMw.afterResponse(resp)).not.toThrow();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('evil.com');
    });

    it('scans tool call inputs for blocked domains', () => {
      const logs: string[] = [];
      const logMw = new DomainAllowlistMiddleware(['github.com'], (msg) =>
        logs.push(msg),
      );
      const resp: LlmResponse = {
        content: 'Ok',
        toolCalls: [{ name: 'fetch', input: { url: 'https://evil.com/data' } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      };
      expect(() => logMw.afterResponse(resp)).not.toThrow();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('evil.com');
      expect(logs[0]).toContain('fetch');
    });
  });

  describe('domain matching', () => {
    it('is case-insensitive', () => {
      expect(() =>
        mw.beforeRequest(
          makeRequest('Fetch https://GITHUB.COM/org/repo'),
        ),
      ).not.toThrow();
    });

    it('does not match partial domain names', () => {
      expect(() =>
        mw.beforeRequest(makeRequest('Visit https://notgithub.com')),
      ).toThrow(DomainBlockedError);
    });
  });
});

describe('Security profile domain allowlist integration', () => {
  it('strict profile throws if allowedDomains is empty', () => {
    const config = resolveSecurityConfig('strict', { allowedDomains: [] });
    expect(() => buildMiddlewareChain(config)).toThrow(
      /strict.*allowedDomains/,
    );
  });

  it('standard profile skips allowlist middleware when not configured', () => {
    const config = resolveSecurityConfig('standard');
    const chain = buildMiddlewareChain(config);
    expect(
      chain.getMiddlewares().some((m) => m.name === 'domain-allowlist'),
    ).toBe(false);
  });

  it('standard profile includes allowlist when configured', () => {
    const config = resolveSecurityConfig('standard', {
      allowedDomains: ['github.com'],
    });
    const chain = buildMiddlewareChain(config);
    expect(
      chain.getMiddlewares().some((m) => m.name === 'domain-allowlist'),
    ).toBe(true);
  });

  it('permissive profile never includes allowlist', () => {
    const config = resolveSecurityConfig('permissive', {
      allowedDomains: ['github.com'],
    });
    const chain = buildMiddlewareChain(config);
    expect(
      chain.getMiddlewares().some((m) => m.name === 'domain-allowlist'),
    ).toBe(false);
  });
});
