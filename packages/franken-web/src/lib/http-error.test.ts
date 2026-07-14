import { describe, expect, it } from 'vitest';
import { extractResponseErrorMessage, toError } from './http-error';

describe('http-error helpers', () => {
  it('extracts shared response error message shapes', async () => {
    await expect(extractResponseErrorMessage(new Response(JSON.stringify({
      error: 'Flat failure',
    })))).resolves.toBe('Flat failure');

    await expect(extractResponseErrorMessage(new Response(JSON.stringify({
      error: { message: 'Nested failure' },
    })))).resolves.toBe('Nested failure');
  });

  it('returns undefined for unusable response bodies', async () => {
    await expect(extractResponseErrorMessage(new Response(JSON.stringify({
      error: { code: 'NO_MESSAGE' },
    })))).resolves.toBeUndefined();

    await expect(extractResponseErrorMessage(new Response('<not-json>'))).resolves.toBeUndefined();
  });

  it('normalizes unknown thrown values into Error instances', () => {
    const existing = new Error('Already an Error');
    expect(toError(existing)).toBe(existing);
    expect(toError('string failure')).toMatchObject({ message: 'string failure' });
  });
});
