import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GUIDE_PATH = 'docs/onboarding/getting-help.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2531 first-contribution help path', () => {
  it('is discoverable from contributor onboarding entrypoints', () => {
    expect(readText('README.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('CONTRIBUTING.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('docs/onboarding/README.md')).toContain('(getting-help.md)');
  });

  it('routes common blockers and provides a safe copyable help request', () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      'title: Getting help with a first contribution',
      '# Getting help with a first contribution',
      '## Choose the right help channel',
      'Setup or bootstrap failure',
      'Issue scope or acceptance criteria',
      'Test or CI failure',
      'Pull-request review question',
      '## Collect safe diagnostic evidence',
      'git status --short --branch',
      'gh pr checks "$PR_NUMBER"',
      '## Copyable help-request template',
      'What I expected:',
      'What happened:',
      'Exact command:',
      'Redacted output:',
      'What I already tried:',
      'Do not paste credentials',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
