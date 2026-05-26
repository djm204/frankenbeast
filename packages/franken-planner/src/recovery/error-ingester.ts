import type { KnownError } from '../core/types.js';

const MIN_PATTERN_LENGTH = 6;
const WORD_CHAR_CLASS = String.raw`\p{L}\p{N}_`;

export type ErrorClassification =
  | { type: 'known'; knownError: KnownError }
  | { type: 'unknown' };

/**
 * Classifies a task error against a list of known error patterns from MOD-03.
 * Patterns are validated before matching, then matched case-insensitively as
 * literal text bounded by non-word characters to avoid broad substring hits.
 */
export class ErrorIngester {
  classify(error: Error, knownErrors: KnownError[]): ErrorClassification {
    const match = knownErrors.find((ke) => patternMatches(error.message, ke.pattern));
    if (match !== undefined) {
      return { type: 'known', knownError: match };
    }
    return { type: 'unknown' };
  }
}

function patternMatches(message: string, pattern: string): boolean {
  const normalizedPattern = validatePattern(pattern);
  const escapedPattern = escapeRegex(normalizedPattern).replace(/\s+/g, String.raw`\s+`);
  const matcher = new RegExp(
    String.raw`(?<![${WORD_CHAR_CLASS}])${escapedPattern}(?![${WORD_CHAR_CLASS}])`,
    'iu',
  );

  return matcher.test(message);
}

function validatePattern(pattern: string): string {
  const normalizedPattern = pattern.trim();
  if (normalizedPattern.length < MIN_PATTERN_LENGTH) {
    throw new RangeError(
      `Known error patterns must be at least ${MIN_PATTERN_LENGTH} characters long`,
    );
  }

  return normalizedPattern;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
