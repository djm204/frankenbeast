import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const VERIFY_EVERYTHING_TEST = resolve(ROOT, 'tests/verify-everything.test.ts');

describe('verify-everything test boundaries', () => {
  it('does not recursively invoke Turbo workspace pipelines', () => {
    const source = readFileSync(VERIFY_EVERYTHING_TEST, 'utf8');

    for (const pipeline of ['build', 'test']) {
      expect(source).not.toContain(['npx', 'turbo', 'run', pipeline].join(' '));
    }
  });
});
