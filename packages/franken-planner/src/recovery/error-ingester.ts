import { constants } from 'node:os';
import type { KnownError } from '../core/types.js';

const MIN_PATTERN_LENGTH = 6;
const WORD_CHAR_CLASS = String.raw`\p{L}\p{N}_`;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

/**
 * Recognized canonical error/signal codes that are highly specific and worth
 * keeping even when shorter than the trivial-pattern gate (e.g. `E2BIG`, `EDOM`,
 * `SIGIO`). Derived from Node's own `os.constants` so the full errno/signal set
 * is covered exactly, rather than a hand-curated list. This is deliberately not a
 * shape like `E[A-Z]+`, which would also exempt ordinary words such as
 * `error`/`end` and reintroduce the broad false positives the gate prevents.
 */
const CANONICAL_CODES = new Set<string>([
  ...Object.keys(constants.errno ?? {}),
  ...Object.keys(constants.signals ?? {}),
]);

/**
 * True when a sub-minimum-length pattern is a recognized canonical code (a Node
 * errno/signal code or a Node `ERR_*` code). Matched case-insensitively to mirror
 * the `iu` matcher, so a lowercase stored code like `eperm` is accepted.
 */
function isCanonicalErrorCode(pattern: string): boolean {
  const upper = pattern.toUpperCase();
  return CANONICAL_CODES.has(upper) || /^ERR_[A-Z0-9_]+$/.test(upper);
}

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
  // Only guard an edge with a word boundary when the pattern actually starts/ends
  // with a word character. Applying the lookarounds unconditionally would drop
  // legitimate partial patterns ending (or starting) in punctuation — e.g.
  // `failed:` or `Cannot find module '` — when adjacent error text is a word.
  const leadingBoundary = WORD_CHAR_RE.test(normalizedPattern[0] ?? '')
    ? String.raw`(?<![${WORD_CHAR_CLASS}])`
    : '';
  const trailingBoundary = WORD_CHAR_RE.test(normalizedPattern[normalizedPattern.length - 1] ?? '')
    ? String.raw`(?![${WORD_CHAR_CLASS}])`
    : '';
  const matcher = new RegExp(`${leadingBoundary}${escapedPattern}${trailingBoundary}`, 'iu');

  return matcher.test(message);
}

function validatePattern(pattern: string): string {
  const normalizedPattern = pattern.trim();
  if (
    normalizedPattern.length < MIN_PATTERN_LENGTH &&
    !isCanonicalErrorCode(normalizedPattern)
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
