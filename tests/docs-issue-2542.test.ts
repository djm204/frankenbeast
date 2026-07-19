import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2542 first-time contributor guide', () => {
  it('links the contributor guide from public onboarding entrypoints', () => {
    expect(readText('README.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('docs/onboarding/README.md')).toContain('[Contributor guide](../../CONTRIBUTING.md)');
  });

  it('provides a complete first contribution path', () => {
    const guide = readText('CONTRIBUTING.md');

    for (const expected of [
      '# Contributing to Frankenbeast',
      '## Before you start',
      '## Set up your checkout',
      'npm run bootstrap -- --no-docker',
      '## Make one focused change',
      '## Verify the change',
      'docs/onboarding/test-command-decision-tree.md',
      'tests/docs-issue-${ISSUE_NUMBER}.test.ts',
      '## Commit and open a pull request',
      'Closes #<issue-number>',
      '## Before requesting review',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
