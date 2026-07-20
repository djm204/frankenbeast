/** A normalized score between 0 and 1. */
declare const scoreBrand: unique symbol;
export type Score = number & { readonly [scoreBrand]: 'Score' };

/**
 * Creates a branded normalized score.
 *
 * @throws {RangeError} when value is not finite or outside the inclusive 0-1 range.
 */
export function createScore(value: number): Score {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Score must be a finite number between 0 and 1');
  }

  return value as Score;
}
