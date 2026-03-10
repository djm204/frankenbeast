import { describe, it, expect } from 'vitest';
import { ErrorIngester } from '../../../../src/planner/recovery/error-ingester';
import type { KnownError } from '../../../../src/planner/core/types';

function makeKnownError(pattern: string, fix = `fix for ${pattern}`): KnownError {
  return { pattern, description: `Error matching '${pattern}'`, fixSuggestion: fix };
}

describe('ErrorIngester', () => {
  it('returns { type: "unknown" } when no known errors exist', () => {
    const result = new ErrorIngester().classify(new Error('something went wrong'), []);
    expect(result.type).toBe('unknown');
  });

  it('returns { type: "unknown" } when no pattern matches', () => {
    const known = [makeKnownError('network timeout')];
    const result = new ErrorIngester().classify(new Error('disk full'), known);
    expect(result.type).toBe('unknown');
  });

  it('returns { type: "known", knownError } when pattern matches error message', () => {
    const ke = makeKnownError('disk full');
    const result = new ErrorIngester().classify(new Error('disk full error'), [ke]);
    expect(result.type).toBe('known');
    if (result.type !== 'known') throw new Error('unexpected');
    expect(result.knownError).toEqual(ke);
  });

  it('matching is case-insensitive', () => {
    const ke = makeKnownError('Disk Full');
    const result = new ErrorIngester().classify(new Error('disk full error'), [ke]);
    expect(result.type).toBe('known');
  });

  it('returns the first matching KnownError when multiple patterns match', () => {
    const ke1 = makeKnownError('timeout', 'retry after delay');
    const ke2 = makeKnownError('network timeout', 'check connection');
    const result = new ErrorIngester().classify(new Error('network timeout occurred'), [ke1, ke2]);
    expect(result.type).toBe('known');
    if (result.type !== 'known') throw new Error('unexpected');
    expect(result.knownError).toEqual(ke1);
  });

  it('partial pattern match is sufficient', () => {
    const ke = makeKnownError('timeout');
    const result = new ErrorIngester().classify(new Error('connection timeout after 30s'), [ke]);
    expect(result.type).toBe('known');
  });
});
