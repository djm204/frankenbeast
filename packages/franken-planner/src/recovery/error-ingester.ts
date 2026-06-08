import type { KnownError } from '../core/types.js';

const MIN_PATTERN_LENGTH = 6;
const WORD_CHAR_CLASS = String.raw`\p{L}\p{N}_`;
/**
 * Canonical OS/CLI error codes (e.g. `EPERM`, `EPIPE`, `SIGKILL`) are short but
 * highly specific, so they are exempt from the minimum-length trivial-pattern
 * gate. Matches an uppercase, underscore-or-digit token of at least 3 chars.
 */
const CANONICAL_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,}$/;

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
  let normalizedPattern: string;
  try {
    normalizedPattern = validatePattern(pattern);
  } catch (err) {
    // A single malformed/stale stored pattern (e.g. an empty or trivially
    // short memory entry) must not abort the whole classification loop and
    // mask valid later patterns. Skip it so matching falls through to the
    // remaining knownErrors and, ultimately, the unknown-error path.
    console.warn(
      `[ErrorIngester] skipping invalid known error pattern ${JSON.stringify(pattern)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
  const escapedPattern = escapeRegex(normalizedPattern).replace(/\s+/g, String.raw`\s+`);
  const matcher = new RegExp(
    String.raw`(?<![${WORD_CHAR_CLASS}])${escapedPattern}(?![${WORD_CHAR_CLASS}])`,
    'iu',
  );

  return matcher.test(message);
}

function validatePattern(pattern: string): string {
  const normalizedPattern = pattern.trim();
  if (
    normalizedPattern.length < MIN_PATTERN_LENGTH &&
    !CANONICAL_ERROR_CODE.test(normalizedPattern)
  ) {
    throw new RangeError(
      `Known error patterns must be at least ${MIN_PATTERN_LENGTH} characters long`,
    );
  }

  return normalizedPattern;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
