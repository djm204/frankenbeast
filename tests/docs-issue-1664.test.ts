import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
      'ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"',
      'ISSUE_NUMBER="${ISSUE_NUMBER#\\#}"',
      'gh issue view "$ISSUE_NUMBER" --repo djm204/frankenbeast',
      'gh pr list --repo djm204/frankenbeast --state open',
      '--limit 100',
      'resolve/issue-$ISSUE_NUMBER-',
      'python3 - <<\'PY\'',
      'for relative in [\'tasks/resolve-issues-shared-lessons.md\', \'tasks/lessons.md\', \'AGENTS.md\']:',
      'npm run issue:worktree -- --dry-run --issue "$ISSUE_NUMBER"',
      'git worktree add "../resolve-wt/issue-$ISSUE_NUMBER" -b "$BRANCH_NAME" origin/main',
      'git config extensions.worktreeConfig true',
      'git config --worktree user.name "David Mendez"',
      'git add <files-you-intentionally-changed>',
      'git diff --cached --check',
      'git commit -m "<type(scope): concise issue-specific summary>"',
      'npm run test:root -- <targeted-test-file-for-your-change>',
      'npm test --workspace <touched-workspace-if-applicable>',
      'npm run lint',
      'npm run typecheck',
      'npm run build',
      'git push -u origin HEAD',
      'gh pr create',
      '--title "<type(scope): concise issue-specific summary>"',
      'PR_NUMBER="${PR_NUMBER:?set the pull request number}"',
      'gh pr comment "$PR_NUMBER" --repo djm204/frankenbeast --body "@codex review"',
      'VERIFIED_HEAD="$(gh pr view "$PR_NUMBER" --repo djm204/frankenbeast --json headRefOid --jq .headRefOid)"',
      'gh pr checks "$PR_NUMBER" --repo djm204/frankenbeast --watch && \\',
      'gh pr merge "$PR_NUMBER" --repo djm204/frankenbeast --squash --delete-branch --match-head-commit "$VERIFIED_HEAD"',
    ]) {
      expect(runbook).toContain(command);
    }
  });

  it('documents Codex trigger policy, HITL stop points, and first-PR issue suitability', () => {
    const runbook = readText(runbookPath);

    for (const guardrail of [
      'one issue, one isolated branch/worktree, one PR',
      'No secrets, production data, destructive migrations, release credentials, or customer-impacting side effects are required.',
      'The PR body must include `Closes #<issue-number>`',
      'Ownership entry IDs: <manifest entry ids from docs/onboarding/repository-ownership.manifest.json',
      'silence or only an `eyes` reaction',
      'usage-limit text',
      'a clean comment that predates your latest push',
      'Stop at the configured review-invocation cap and ask for HITL approval before exceeding it.',
      'by body/title search or by a `resolve/issue-$ISSUE_NUMBER-*` head branch',
      'replacing the placeholders with your actual issue-scoped paths and commit subject',
      'Replace the placeholder commands with the narrowest regression for the files you touched',
      'Run it only after the coordinator/HITL reviewer has authorized push and PR creation for the assigned issue.',
      'authorized Codex review for this PR',
      'push, merge, delete a branch, close an issue, edit labels, or rerun over the Codex cap',
      'local worktree state includes unrelated staged/dirty files you cannot safely separate',
      'the next action would require secrets or access to production systems',
    ]) {
      expect(runbook).toContain(guardrail);
    }
  });

  it('includes the runbook in the generated coding-agent first-run checklist', () => {
    const result = spawnSync(process.execPath, ['scripts/first-run-checklist.mjs', '--json', '--persona', 'coding-agent'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const checklist = JSON.parse(result.stdout) as { items: Array<{ id: string; docs: string[] }> };
    expect(checklist.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'first-pr-runbook',
        docs: expect.arrayContaining([
          'docs/onboarding/first-pr-agent-runbook.md',
          'docs/onboarding/repository-ownership.manifest.json',
        ]),
      }),
    ]));
  });
});
