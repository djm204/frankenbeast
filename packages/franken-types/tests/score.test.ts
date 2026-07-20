import { describe, expect, expectTypeOf, it } from 'vitest';
import { createScore } from '../src/index.js';
import type { Score } from '../src/index.js';

describe('Score', () => {
  it('brands normalized scores created through the shared constructor', () => {
    const score = createScore(0.75);

    expectTypeOf(score).toEqualTypeOf<Score>();
    expect(score).toBe(0.75);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
    'rejects an invalid normalized score: %s',
    (value) => {
      expect(() => createScore(value)).toThrow(RangeError);
    },
  );

  it('does not accept unbranded numbers as scores', () => {
    // @ts-expect-error Score must be constructed through createScore.
    const score: Score = 0.5;

    expect(score).toBe(0.5);
  });
});
