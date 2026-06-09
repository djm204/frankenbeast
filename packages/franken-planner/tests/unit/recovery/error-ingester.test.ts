import { describe, it, expect } from 'vitest';
import { ErrorIngester } from '../../../src/recovery/error-ingester';
import type { KnownError } from '../../../src/core/types';

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

  it('skips empty known error patterns without aborting classification', () => {
    const result = new ErrorIngester().classify(new Error('unrelated failure'), [
      makeKnownError(''),
    ]);
    expect(result.type).toBe('unknown');
  });

  it('skips trivial known error patterns without aborting classification', () => {
    const result = new ErrorIngester().classify(new Error('any error message'), [
      makeKnownError('error'),
    ]);
    expect(result.type).toBe('unknown');
  });

  it('matches short canonical error codes despite the length gate', () => {
    const result = new ErrorIngester().classify(new Error('spawnSync git EPERM'), [
      makeKnownError('EPERM'),
    ]);
    expect(result.type).toBe('known');
  });

  it('matches a lowercase canonical code (case-insensitive exemption)', () => {
    const result = new ErrorIngester().classify(new Error('spawnSync git EPERM'), [
      makeKnownError('eperm'),
    ]);
    expect(result.type).toBe('known');
  });

  it('exempts ERR_/SIG code shapes from the length gate', () => {
    const sig = new ErrorIngester().classify(new Error('child killed by SIGKILL'), [
      makeKnownError('SIGKILL'),
    ]);
    expect(sig.type).toBe('known');
  });

  it('does not exempt short uppercase common words from the length gate', () => {
    // `THE` is not a recognized code shape, so it stays gated as trivial and is
    // skipped rather than matching common words in error text.
    const result = new ErrorIngester().classify(new Error('THE build failed'), [
      makeKnownError('THE'),
    ]);
    expect(result.type).toBe('unknown');
  });

  it('still matches valid patterns that follow an invalid stored pattern', () => {
    const trivial = makeKnownError('error');
    const valid = makeKnownError('disk full');
    const result = new ErrorIngester().classify(new Error('disk full error'), [trivial, valid]);
    expect(result.type).toBe('known');
    expect(result).toMatchObject({ knownError: valid });
  });

  it('does not match literal patterns inside larger words', () => {
    const ke = makeKnownError('timeout');
    const result = new ErrorIngester().classify(new Error('operation timedout unexpectedly'), [ke]);
    expect(result.type).toBe('unknown');
  });
});
