import type { LlmRequest } from '@franken/types';
import type { LlmMiddleware, LlmResponse } from './llm-middleware.js';

const URL_PATTERN =
  /https?:\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,}))(\/[^\s)'"]*)?/g;

export class DomainBlockedError extends Error {
  constructor(
    public readonly domain: string,
    public readonly allowlist: readonly string[],
  ) {
    super(
      `Domain "${domain}" is not in the allowlist. Allowed: ${allowlist.join(', ')}`,
    );
    this.name = 'DomainBlockedError';
  }
}

export class DomainAllowlistMiddleware implements LlmMiddleware {
  readonly name = 'domain-allowlist';
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly logger: ((msg: string) => void) | undefined;

  constructor(domains: string[], logger?: (msg: string) => void) {
    this.allowedDomains = new Set(
      domains.map((d) => d.toLowerCase().replace(/^\./, '')),
    );
    this.logger = logger;
  }

  beforeRequest(request: LlmRequest): LlmRequest {
    for (const msg of request.messages) {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter(
                (b): b is { type: 'text'; text: string } =>
                  b.type === 'text',
              )
              .map((b) => b.text)
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
    for (const domain of this.extractDomains(response.content)) {
      if (!this.isDomainAllowed(domain)) {
        this.logger?.(
          `[security] Response contains blocked domain: ${domain}`,
        );
      }
    }
    return response;
  }

  private extractDomains(text: string): string[] {
    const domains: string[] = [];
    const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      domains.push(match[1]!.toLowerCase());
    }
    return domains;
  }

  private isDomainAllowed(domain: string): boolean {
    if (this.allowedDomains.has(domain)) return true;
    for (const allowed of this.allowedDomains) {
      if (domain.endsWith(`.${allowed}`)) return true;
    }
    return false;
  }
}
