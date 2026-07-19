import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GUIDE_PATH = 'docs/onboarding/docs-only-contribution.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2540 docs-only contributor quickstart', () => {
  it('is discoverable from public contributor entrypoints', () => {
    expect(readText('README.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('CONTRIBUTING.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('docs/onboarding/README.md')).toContain('(docs-only-contribution.md)');
  });

  it('documents a complete, low-overhead docs contribution workflow', () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      'title: Docs-only contribution quickstart',
      '# Docs-only contribution quickstart',
      '## 1. Confirm the issue is available',
      'gh issue view "$ISSUE_NUMBER"',
      'gh pr list',
      '## 2. Create a focused branch',
      'git switch -c "docs/issue-${ISSUE_NUMBER}-short-description"',
      '## 3. Edit and preview',
      '## 4. Run documentation checks',
      'npm run test:root -- "tests/docs-issue-${ISSUE_NUMBER}.test.ts"',
      'npm run test:root',
      '## 5. Open a reviewable pull request',
      'Closes #<issue-number>',
      'Docker and optional local services are not required',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
