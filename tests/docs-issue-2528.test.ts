import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GUIDE_PATH = 'docs/onboarding/fork-and-branch-recovery.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #2528 fork and branch recovery guide', () => {
  it('is discoverable from contributor onboarding entrypoints', () => {
    expect(readText('README.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('CONTRIBUTING.md')).toContain(`(${GUIDE_PATH})`);
    expect(readText('docs/onboarding/README.md')).toContain('(fork-and-branch-recovery.md)');
  });

  it('provides safe, copyable recovery paths for common first-PR git blockers', () => {
    const guide = readText(GUIDE_PATH);

    for (const expected of [
      'title: Fork and branch recovery for first contributors',
      '# Fork and branch recovery for first contributors',
      '## Confirm your remotes and save local work',
      'git status --short --branch',
      'git remote -v',
      'git stash push -u',
      'RECOVERY_STASH="$(git stash list -1',
      'git stash apply "$RECOVERY_STASH"',
      'git stash drop "$RECOVERY_STASH"',
      '## Bring an untouched branch up to date',
      'git fetch upstream main',
      'git branch --list "$BRANCH_NAME"',
      'git rebase upstream/main',
      'Do not rebase a branch that is already on your fork',
      'git merge upstream/main',
      '## Recover work made on the wrong branch',
      'git switch -c',
      '## Handle a rejected push',
      'git push --set-upstream origin HEAD',
      'Do not use `git push --force`',
      '## Ask for help before continuing when',
    ]) {
      expect(guide).toContain(expected);
    }
  });
});
