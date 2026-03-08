import type { UnifiedRequest, Message, MessageContentBlock } from "../../types/index.js";
import { pass } from "../interceptor-result.js";
import type { InterceptorResult } from "../interceptor-result.js";

// ---------------------------------------------------------------------------
// PII patterns
// ---------------------------------------------------------------------------

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    // Email addresses
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL]",
  },
  {
    // Credit card numbers (Visa, MC, Amex, Discover — with or without spaces/dashes)
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})(?:[\s\-]?[0-9]{4})*\b/g,
    replacement: "[CC]",
  },
  {
    // SSN: 123-45-6789 or 123 45 6789
    pattern: /\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/g,
    replacement: "[SSN]",
  },
  {
    // Phone numbers: US and international formats
    pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]\d{4}\b/g,
    replacement: "[PHONE]",
  },
];

// ---------------------------------------------------------------------------
// Masking helpers
// ---------------------------------------------------------------------------

function maskText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function maskContentBlock(block: MessageContentBlock): MessageContentBlock {
  return {
    ...block,
    ...(block.text !== undefined ? { text: maskText(block.text) } : {}),
    ...(block.content !== undefined ? { content: maskText(block.content) } : {}),
  };
}

function maskMessage(msg: Message): Message {
  if (typeof msg.content === "string") {
    return { ...msg, content: maskText(msg.content) };
  }
  return { ...msg, content: msg.content.map(maskContentBlock) };
}

// ---------------------------------------------------------------------------
// Public interceptor
// ---------------------------------------------------------------------------

export function maskPii(
  request: UnifiedRequest,
  redactPii: boolean,
): InterceptorResult<UnifiedRequest> {
  if (!redactPii) {
    return pass(request);
  }

  const maskedRequest: UnifiedRequest = {
    ...request,
    ...(request.system !== undefined ? { system: maskText(request.system) } : {}),
    messages: request.messages.map(maskMessage),
  };

  return pass(maskedRequest);
}
