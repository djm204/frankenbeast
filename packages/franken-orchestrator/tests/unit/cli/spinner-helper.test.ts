import { describe, it, expect, vi } from 'vitest';
import { withSpinner } from '../../../src/cli/spinner.js';

describe('withSpinner', () => {
  it('returns the result of the wrapped async function', async () => {
    const result = await withSpinner('loading', async () => 'hello', { silent: true });
    expect(result).toBe('hello');
  });

  it('rethrows errors from the wrapped function', async () => {
    await expect(
      withSpinner('loading', async () => { throw new Error('boom'); }, { silent: true }),
    ).rejects.toThrow('boom');
  });

  it('calls write with spinner frames when not silent', async () => {
    const writes: string[] = [];
    const write = (text: string) => { writes.push(text); };
    await withSpinner('test', async () => {
      // Give spinner time to render at least one frame
      await new Promise((r) => setTimeout(r, 150));
      return 42;
    }, { write });
    expect(writes.length).toBeGreaterThan(0);
  });
});
