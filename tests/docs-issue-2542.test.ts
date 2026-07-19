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
    expect(readText('ONBOARDING.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('docs/onboarding/README.md')).toContain('[Contributor guide](../../CONTRIBUTING.md)');
  });

  it('provides a complete first contribution path', () => {
    const guide = readText('CONTRIBUTING.md');

    for (const expected of [
      '# Contributing to Frankenbeast',
      '## Before you start',
      '--search "$ISSUE_NUMBER OR issue-$ISSUE_NUMBER"',
      '## Set up your checkout',
      'npm run bootstrap -- --no-docker',
      '## Make one focused change',
      '## Verify the change',
      'docs/onboarding/test-command-decision-tree.md',
      'tests/docs-issue-${ISSUE_NUMBER}.test.ts',
      '## Commit and open a pull request',
      'git add --intent-to-add <new-path>',
      'COMMIT_SUBJECT="docs(onboarding): describe your issue-specific change"',
      'Closes #<issue-number>',
      '## Before requesting review',
    ]) {
      expect(guide).toContain(expected);
    }
  });

  it('routes the contributor guide to the onboarding documentation owner', () => {
    const manifest = JSON.parse(readText('docs/onboarding/repository-ownership.manifest.json')) as {
      entries: Array<{ id: string; paths: string[] }>;
    };
    const onboardingOwner = manifest.entries.find((entry) => entry.id === 'onboarding-docs');

    expect(onboardingOwner?.paths).toContain('CONTRIBUTING.md');
  });
});
