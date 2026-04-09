import { describe, expect, it } from 'vitest';
import { resolveInitOptions } from './init-options.js';

describe('resolveInitOptions', () => {
  it('keeps hooks disabled and installs all servers by default', async () => {
    const options = await resolveInitOptions(['node', 'main.js', 'init']);

    expect(options.hooks).toBe(false);
    expect(options.servers).toBeUndefined();
  });

  it('parses hooks and selected servers from --pick input', async () => {
    const options = await resolveInitOptions(
      ['node', 'main.js', 'init', '--hooks', '--pick'],
      async () => ['memory', 'critique'],
    );

    expect(options.hooks).toBe(true);
    expect(options.servers).toEqual(['memory', 'critique']);
  });
});
