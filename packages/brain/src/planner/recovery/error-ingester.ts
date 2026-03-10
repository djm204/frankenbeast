import type { KnownError } from '../core/types.js';

export type ErrorClassification =
  | { type: 'known'; knownError: KnownError }
  | { type: 'unknown' };

/**
 * Classifies a task error against a list of known error patterns from MOD-03.
 * Matching is case-insensitive substring search on the error message.
 */
export class ErrorIngester {
  classify(error: Error, knownErrors: KnownError[]): ErrorClassification {
    const msg = error.message.toLowerCase();
    const match = knownErrors.find((ke) => msg.includes(ke.pattern.toLowerCase()));
    if (match !== undefined) {
      return { type: 'known', knownError: match };
    }
    return { type: 'unknown' };
  }
}
