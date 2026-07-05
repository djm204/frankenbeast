import { describe, expect, it } from 'vitest';
import { GovernorError } from '../../../src/errors/governor-error.js';

describe('GovernorError', () => {
  it('preserves the original cause when provided', () => {
    const cause = new Error('database unavailable');
    const error = new GovernorError('approval failed', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GovernorError);
    expect(error.cause).toBe(cause);
  });
});
