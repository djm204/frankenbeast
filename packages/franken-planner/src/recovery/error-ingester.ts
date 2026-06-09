import type { KnownError } from '../core/types.js';

const MIN_PATTERN_LENGTH = 6;
const WORD_CHAR_CLASS = String.raw`\p{L}\p{N}_`;
/**
 * Short errno-style codes that are highly specific and worth keeping even though
 * they fall under the minimum-length trivial-pattern gate. A curated allowlist is
 * used (rather than a shape like `E[A-Z]+`) because a shape would also exempt
 * ordinary E-words such as `error`/`end`, reintroducing the broad false positives
 * this gate exists to prevent. Longer codes (most signals, all `ERR_*` Node codes)
 * already clear the length gate on their own.
 */
const CANONICAL_ERRNO_CODES = new Set([
  'EPERM', 'ENOENT', 'ESRCH', 'EINTR', 'EIO', 'ENXIO', 'EBADF', 'EAGAIN',
  'ENOMEM', 'EACCES', 'EFAULT', 'EBUSY', 'EEXIST', 'EXDEV', 'ENODEV', 'ENOTDIR',
  'EISDIR', 'EINVAL', 'ENFILE', 'EMFILE', 'ENOTTY', 'EFBIG', 'ENOSPC', 'ESPIPE',
  'EROFS', 'EMLINK', 'EPIPE', 'ELOOP', 'EPROTO', 'EHOSTDOWN',
]);

/**
 * True when a sub-minimum-length pattern is a recognized canonical error code
 * (a known errno code or a Node `ERR_*` code). Matched case-insensitively to
 * mirror the `iu` matcher, so a lowercase stored code like `eperm` is accepted.
 */
function isCanonicalErrorCode(pattern: string): boolean {
  const upper = pattern.toUpperCase();
  return CANONICAL_ERRNO_CODES.has(upper) || /^ERR_[A-Z0-9_]+$/.test(upper);
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
