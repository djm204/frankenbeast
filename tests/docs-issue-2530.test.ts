import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2530 first pull request handoff', () => {
  it('keeps the contributor guide reachable from public onboarding entrypoints', () => {
    expect(readText('README.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('ONBOARDING.md')).toContain('[contributor guide](CONTRIBUTING.md)');
    expect(readText('docs/onboarding/README.md')).toContain(
      '[Contributor guide](../../CONTRIBUTING.md)',
    );
  });

  it('provides a copyable and verifiable non-interactive PR handoff', () => {
    const guide = readText('CONTRIBUTING.md');

    for (const expected of [
      'For a copyable, non-interactive first-PR handoff',
      'ISSUE_NUMBER="2530" # replace with the issue you are closing',
      ': "${ISSUE_NUMBER:?set ISSUE_NUMBER to the issue you are closing}"',
      'PR_URL=$(gh pr create',
      '--repo djm204/frankenbeast',
      '--base main',
      '--title "$PR_TITLE"',
      'Closes #${ISSUE_NUMBER}',
      'gh pr view "$PR_URL" --json number,title,body,baseRefName,headRefName,url',
      'gh pr edit "$PR_URL"',
      "GitHub cannot change an existing pull request's head branch",
      'close the pull request, switch to and push the intended branch',
      'Never list a test that you skipped or that failed',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
