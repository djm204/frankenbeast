import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateVerificationTaskWiring } from './helpers/verification-task-wiring.js';

const ROOT = resolve(import.meta.dirname, '..');
const VERIFY_EVERYTHING_TEST = resolve(ROOT, 'tests/verify-everything.test.ts');

describe('verify-everything test boundaries', () => {
  it('does not recursively invoke Turbo workspace pipelines', () => {
    const source = readFileSync(VERIFY_EVERYTHING_TEST, 'utf8');

    for (const pipeline of ['build', 'test']) {
      expect(source).not.toContain(['npx', 'turbo', 'run', pipeline].join(' '));
    }
  });

  it('rejects missing and stale aggregate verification scripts', () => {
    expect(() =>
      validateVerificationTaskWiring(
        { build: 'turbo run build' },
        { build: {}, test: {} },
      ),
    ).toThrow(/test.*turbo run test/i);

    expect(() =>
      validateVerificationTaskWiring(
        { build: 'turbo run compile', test: 'turbo run test' },
        { build: {}, test: {} },
      ),
    ).toThrow(/build.*turbo run build/i);
  });

  it('rejects aggregate scripts whose Turbo tasks are missing or invalid', () => {
    expect(() =>
      validateVerificationTaskWiring(
        { build: 'turbo run build', test: 'turbo run test' },
        { build: {} },
      ),
    ).toThrow(/Turbo task.*test/i);

    expect(() =>
      validateVerificationTaskWiring(
        { build: 'turbo run build', test: 'turbo run test' },
        { build: {}, test: undefined },
      ),
    ).toThrow(/Turbo task.*test/i);
  });
});
