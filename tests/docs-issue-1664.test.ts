import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const runbookPath = 'docs/onboarding/first-pr-agent-runbook.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #1664 first-PR agent runbook', () => {
  it('links the runbook from onboarding entrypoints and PR etiquette guidance', () => {
    const onboarding = readText('ONBOARDING.md');
    const readme = readText('README.md');
    const etiquette = readText('docs/onboarding/coding-agent-pr-etiquette.md');

    expect(onboarding).toContain('[first-PR agent runbook](docs/onboarding/first-pr-agent-runbook.md)');
    expect(onboarding).toContain('branch/worktree setup, implementation, verification, PR creation, Codex review, and merge handoff');
    expect(readme).toContain('[first-PR agent runbook](docs/onboarding/first-pr-agent-runbook.md)');
    expect(etiquette).toContain('[first-PR agent runbook](first-pr-agent-runbook.md)');
  });

  it('contains a numbered issue-to-merged-PR flow with exact command examples', () => {
    const runbook = readText(runbookPath);

    for (const heading of [
      '# First-PR agent runbook',
      '## Before you start: first-PR fit checklist',
      '## Numbered flow',
      '### 1. Confirm assignment and duplicate state',
      '### 2. Read local policy before editing',
      '### 3. Create an isolated issue branch/worktree',
      '### 4. Inspect the relevant surface and plan the smallest diff',
      '### 5. Implement with an atomic commit boundary',
      '### 6. Select and run verification commands',
      '### 7. Push and open the PR',
      '### 8. Trigger the real GitHub Codex gate',
      '### 9. Merge or hand off',
      '### 10. Close out and record reusable lessons',
      '## HITL stop conditions',
    ]) {
      expect(runbook).toContain(heading);
    }

    for (const command of [
      'gh issue view 1664 --repo djm204/frankenbeast',
      'gh pr list --repo djm204/frankenbeast --state open',
      'npm run issue:worktree -- --dry-run --issue 1664',
      'git worktree add ../resolve-wt/issue-1664 -b resolve/issue-1664-feat-onboarding-add-first-pr-agent-runbook origin/main',
      'git config user.name "David Mendez"',
      'git diff --cached --check',
      'git commit -m "docs(onboarding): add first-pr agent runbook"',
      'npm run test:root -- tests/docs-issue-1664.test.ts',
      'npm run lint',
      'npm run typecheck',
      'npm run build',
      'git push -u origin HEAD',
      'gh pr create',
      'gh pr comment <PR_NUMBER> --repo djm204/frankenbeast --body "@codex review"',
      'gh pr checks <PR_NUMBER> --repo djm204/frankenbeast',
      'gh pr merge <PR_NUMBER> --repo djm204/frankenbeast --squash --delete-branch',
    ]) {
      expect(runbook).toContain(command);
    }
  });

  it('documents Codex trigger policy, HITL stop points, and first-PR issue suitability', () => {
    const runbook = readText(runbookPath);

    for (const guardrail of [
      'one issue, one isolated branch/worktree, one PR',
      'No secrets, production data, destructive migrations, release credentials, or customer-impacting side effects are required.',
      'The PR body must include `Closes #1664`',
      'silence or only an `eyes` reaction',
      'usage-limit text',
      'a clean comment that predates your latest push',
      'Stop at the configured review-invocation cap and ask for HITL approval before exceeding it.',
      'push, merge, delete a branch, close an issue, edit labels, or rerun over the Codex cap',
      'local worktree state includes unrelated staged/dirty files you cannot safely separate',
      'the next action would require secrets or access to production systems',
    ]) {
      expect(runbook).toContain(guardrail);
    }
  });
});
