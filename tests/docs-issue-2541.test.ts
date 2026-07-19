import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2541 starter issue discovery guidance', () => {
  it('gives first-time contributors an actionable starter-issue workflow', () => {
    const guide = readText('CONTRIBUTING.md');

    for (const expected of [
      '## Find a starter issue',
      'gh issue list --repo djm204/frankenbeast',
      '--label "good first issue"',
      '--json number,title,labels,url',
      'No open pull request already claims the issue',
      'gh issue comment "$ISSUE_NUMBER"',
      'I plan to work on this issue',
    ]) {
      expect(guide).toContain(expected);
    }
  });

  it('keeps the starter-issue workflow discoverable from public onboarding entrypoints', () => {
    expect(readText('README.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('ONBOARDING.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('docs/onboarding/README.md')).toContain('[Contributor guide](../../CONTRIBUTING.md)');
  });
});
