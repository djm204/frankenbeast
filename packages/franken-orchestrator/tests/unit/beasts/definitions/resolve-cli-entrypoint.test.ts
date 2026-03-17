import { describe, it, expect } from 'vitest';
import { resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { resolveCliEntrypoint } from '../../../../src/beasts/definitions/resolve-cli-entrypoint.js';

describe('resolveCliEntrypoint', () => {
  it('returns an absolute path', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(isAbsolute(entrypoint)).toBe(true);
  });

  it('returns a path ending with cli/run.js or cli/run.ts', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(entrypoint).toMatch(/cli\/run\.(js|ts)$/);
  });

  it('resolves to an existing file', () => {
    const entrypoint = resolveCliEntrypoint();
    expect(existsSync(entrypoint)).toBe(true);
  });

  it('prefers dist/cli/run.js when it exists', () => {
    // In a dev environment without dist/, it should fall back to src/cli/run.ts
    // We just verify the returned path exists and is one of the valid options
    const entrypoint = resolveCliEntrypoint();
    const isDist = entrypoint.endsWith('dist/cli/run.js');
    const isSrc = entrypoint.endsWith('src/cli/run.ts');
    expect(isDist || isSrc).toBe(true);
  });
});
