import type { UnifiedRequest } from "../../types/index.js";
import type { SecurityTier } from "../../config/index.js";
import { pass, blockOne } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";

// ---------------------------------------------------------------------------
// Injection pattern categories
// ---------------------------------------------------------------------------

const PATTERNS_ALL_TIERS: RegExp[] = [
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
];

const PATTERNS_STRICT_ONLY: RegExp[] = [
  // Softer manipulation attempts
  /pretend\s+(that\s+)?(you|your)\s+(are|have\s+no|lack|don't\s+have)\s+(restrictions?|guidelines?|rules?|limits?)/i,
  /hypothetically,?\s+(if\s+you\s+(were|had\s+no)|speaking\s+as)/i,
  /in\s+(this\s+)?(scenario|roleplay|game|story|fiction),?\s+(you\s+are|your\s+rules?\s+are|ignore)/i,
];

function extractTextContent(request: UnifiedRequest): string[] {
  const texts: string[] = [];
  if (request.system) texts.push(request.system);

  for (const msg of request.messages) {
    if (typeof msg.content === "string") {
      texts.push(msg.content);
    } else {
      for (const block of msg.content) {
        if (block.text) texts.push(block.text);
        if (block.content) texts.push(block.content);
      }
    }
  }
  return texts;
}

export function scanForInjection(
  request: UnifiedRequest,
  securityTier: SecurityTier = "STRICT",
): InterceptorResult {
  const patterns =
    securityTier === "STRICT"
      ? [...PATTERNS_ALL_TIERS, ...PATTERNS_STRICT_ONLY]
      : PATTERNS_ALL_TIERS;

  const texts = extractTextContent(request);

  for (const text of texts) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return blockOne({
          code: "INJECTION_DETECTED",
          message: `Prompt injection pattern detected: ${pattern.source}`,
          interceptor: "InjectionScanner",
          payload: {
            request_id: request.id,
            matched_pattern: pattern.source,
          },
        });
      }
    }
  }

  return pass();
}
