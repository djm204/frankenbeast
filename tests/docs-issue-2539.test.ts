import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2539 first-time contributor review loop', () => {
  it('documents an actionable review-feedback workflow', () => {
    const guide = readText('CONTRIBUTING.md');

    for (const expected of [
      '## Respond to review feedback',
      'gh pr view "$PR_NUMBER" --repo djm204/frankenbeast --comments',
      'gh pr checks "$PR_NUMBER" --repo djm204/frankenbeast --watch',
      'git diff --check',
      'git diff --cached --stat',
      'git push',
      'Resolve a review conversation only after',
      'CI and review feedback apply to the current head commit',
    ]) {
      expect(guide).toContain(expected);
    }
  });

  it('keeps the contributor guide linked from public onboarding entrypoints', () => {
    expect(readText('README.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('ONBOARDING.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('docs/onboarding/README.md')).toContain('[Contributor guide](../../CONTRIBUTING.md)');
  });
});
