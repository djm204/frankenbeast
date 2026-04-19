import type { LlmRequest } from '@franken/types';
import type { LlmMiddleware, LlmResponse } from './llm-middleware.js';

/**
 * Injection patterns from the original frankenfirewall (v0.pre-consolidation).
 * ALL_TIERS: active in both standard and strict profiles.
 * STRICT_ONLY: softer manipulation patterns, active only in strict.
 */
export const PATTERNS_ALL_TIERS: RegExp[] = [
  // Explicit overrides
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|commands?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i,
  /forget\s+(everything|all)\s+(you('ve|\s+have)\s+been\s+told|above|before)/i,

  // Role reassignment
  /your\s+(real|true|actual|new|primary)\s+(role|purpose|goal|task|job|objective)\s+is/i,
  /you\s+are\s+(now|actually|really)\s+(a|an)\s+\w+/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+\w+\s+(without|that\s+ignores)/i,

  // Priority inversion
  /as\s+a\s+reminder,?\s+(your\s+)?(real|actual|true|primary)\s+task/i,
  /the\s+(real|actual|true)\s+instructions?\s+(are|is|follow)/i,

  // Context poisoning via system/tool results
  /\[system\][\s\S]{0,50}(ignore|override|forget|disregard)/i,
  /<\/?system>/i,

  // Model-specific tokens and jailbreak keywords
  /\[INST\]/i,
  /<<SYS>>/i,
  /\bDAN\b.*\bmode\b/i,
  /\bjailbreak\b/i,

  // Base64-encoded injection (base64 of "ignore")
  /aWdub3Jl/,
];

export const PATTERNS_STRICT_ONLY: RegExp[] = [
  /pretend\s+(that\s+)?(you|your)\s+(are|have\s+no|lack|don't\s+have)\s+(restrictions?|guidelines?|rules?|limits?)/i,
  /hypothetically,?\s+(if\s+you\s+(were|had\s+no)|speaking\s+as)/i,
  /in\s+(this\s+)?(scenario|roleplay|game|story|fiction),?\s+(you\s+are|your\s+rules?\s+are|ignore)/i,
];

export type InjectionTier = 'strict' | 'standard';

export class InjectionDetectedError extends Error {
  constructor(
    message: string,
    public readonly pattern: string,
  ) {
    super(message);
    this.name = 'InjectionDetectedError';
  }
}

export class InjectionDetectionMiddleware implements LlmMiddleware {
  readonly name = 'injection-detection';
  private readonly patterns: RegExp[];

  constructor(tier: InjectionTier = 'standard') {
    this.patterns =
      tier === 'strict'
        ? [...PATTERNS_ALL_TIERS, ...PATTERNS_STRICT_ONLY]
        : PATTERNS_ALL_TIERS;
  }

  beforeRequest(request: LlmRequest): LlmRequest {
    for (const message of request.messages) {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .map((b) => {
                if (b.type === 'text') return (b as { text: string }).text;
                if (b.type === 'tool_result') return (b as { content: string }).content;
                return '';
              })
              .join(' ');

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
    return response;
  }
}
