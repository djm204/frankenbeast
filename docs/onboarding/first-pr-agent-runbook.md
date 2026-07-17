# First-PR agent runbook

Use this runbook when a fresh coding agent receives one small GitHub issue and needs to take it from selection to a review-ready or merged pull request. It is intentionally narrow: one issue, one isolated branch/worktree, one PR, and explicit stop points for human approval.

## Before you start: first-PR fit checklist

Pick or accept an issue only when all of these are true:

- [ ] Scope is one issue with clear acceptance criteria and no required product decision.
- [ ] Labels indicate low-to-medium risk, for example `documentation`, `test`, `dx`, or a tightly scoped `bug`/`enhancement`.
- [ ] The likely diff is small: docs, tests, one package, or one command surface.
- [ ] No secrets, production data, destructive migrations, release credentials, or customer-impacting side effects are required.
- [ ] Existing open PRs do not already claim the issue.
- [ ] The task can be verified with deterministic commands, not only subjective inspection.

Stop and hand back to the PM/HITL reviewer when any checklist item fails.

## Numbered flow

### 1. Confirm assignment and duplicate state

```bash
ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"
ISSUE_NUMBER="${ISSUE_NUMBER#\#}"
gh issue view "$ISSUE_NUMBER" --repo djm204/frankenbeast --json number,title,state,labels,body,url
gh pr list --repo djm204/frankenbeast --state open --search "$ISSUE_NUMBER OR issue-$ISSUE_NUMBER" --json number,title,headRefName,url,state
gh pr list --repo djm204/frankenbeast --state open --json number,title,headRefName,url,state \
  --jq ".[] | select(.headRefName | startswith(\"resolve/issue-$ISSUE_NUMBER-\"))"
```

Continue only if the issue is open and no open PR already owns it by body/title search or by a `resolve/issue-$ISSUE_NUMBER-*` head branch. If an open PR exists, resume that PR only when the PM explicitly assigns it to you; otherwise stop and report the duplicate.

### 2. Read local policy before editing

```bash
python3 - <<'PY'
from pathlib import Path

for relative in ['tasks/resolve-issues-shared-lessons.md', 'tasks/lessons.md', 'AGENTS.md']:
    path = Path(relative)
    if path.exists():
        print(f'\n--- {relative} ---')
        print(path.read_text())
PY
sed -n '1,220p' ONBOARDING.md
sed -n '1,180p' docs/onboarding/coding-agent-pr-etiquette.md
```

Apply the most specific current repository guidance. If you enter a nested package or docs directory that has its own `AGENTS.md`, read that scoped file before editing there. If a local instruction conflicts with the issue, stop and ask the PM/HITL reviewer instead of silently broadening scope.

### 3. Create an isolated issue branch/worktree

Prefer the repository helper when it is available:

```bash
ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"
ISSUE_NUMBER="${ISSUE_NUMBER#\#}"
ISSUE_TITLE="${ISSUE_TITLE:?set a short issue title}"
npm run issue:worktree -- --dry-run --issue "$ISSUE_NUMBER" --title "$ISSUE_TITLE"
npm run issue:worktree -- --issue "$ISSUE_NUMBER" --title "$ISSUE_TITLE"
cd "../resolve-wt/issue-$ISSUE_NUMBER"
```

Manual equivalent:

```bash
ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"
ISSUE_NUMBER="${ISSUE_NUMBER#\#}"
BRANCH_NAME="${BRANCH_NAME:?set the issue branch name}"
git fetch origin main --prune
git worktree add "../resolve-wt/issue-$ISSUE_NUMBER" -b "$BRANCH_NAME" origin/main
cd "../resolve-wt/issue-$ISSUE_NUMBER"
git config extensions.worktreeConfig true
git config --worktree user.name "David Mendez"
git config --worktree user.email "me@davidmendez.dev"
git status --short --branch
```

Do not make the first PR from a dirty shared checkout.

### 4. Inspect the relevant surface and plan the smallest diff

```bash
git grep -n "first PR\|coding-agent\|Codex\|Closes #" -- ONBOARDING.md README.md docs tests package.json
```

For docs-only onboarding issues, prefer a dedicated file under `docs/onboarding/`, a small link from `ONBOARDING.md`, and a focused docs regression test. Do not add runtime behavior unless the issue explicitly asks for it.

### 5. Implement with an atomic commit boundary

```bash
git status --short
git diff -- docs/onboarding/ ONBOARDING.md README.md tests/
```

Keep the diff scoped to the issue. Stage only the files you intentionally changed, replacing the placeholders with your actual issue-scoped paths and commit subject:

```bash
git add <files-you-intentionally-changed>
git diff --cached --stat
git diff --cached --check
git commit -m "<type(scope): concise issue-specific summary>"
```

### 6. Select and run verification commands

Choose the narrowest deterministic check that covers the change, then broaden when practical:

```bash
npm run test:root -- tests/docs-issue-1664.test.ts
npm run test:root -- tests/docs-issue-1094.test.ts
npm run lint
npm run typecheck
npm run build
```

Use the [test command decision tree](test-command-decision-tree.md) when the touched package is not obvious. If a broad command fails for an unrelated pre-existing reason, capture the exact failure and keep the passing targeted command in the PR body.

### 7. Push and open the PR

This step mutates remote GitHub state. Run it only after the PM/HITL reviewer has authorized push and PR creation for the assigned issue.

```bash
git push -u origin HEAD
gh pr create \
  --repo djm204/frankenbeast \
  --title "<type(scope): concise issue-specific summary>" \
  --body "$(cat <<'PR_BODY'
## Summary
- <bullet describing the user-visible or maintainer-visible change>
- <bullet describing the verification or documentation surface updated>

## Verification
- <command> — <passed/failed with reason>
- <command> — <passed/failed with reason>

## Scope and handoff
- Issue: Closes #<issue-number>
- Branch: <branch-name>
- Ownership entries: <files/packages/docs areas touched>
- Codex: pending @codex review
PR_BODY
)"
```

The PR title and every commit subject must be Conventional Commit formatted. The PR body must include `Closes #<issue-number>` for the assigned issue and must not mention unrelated issues as closing keywords.

### 8. Trigger the real GitHub Codex gate

Trigger after the PR is open, the current head contains the intended fix, and the PM/HITL reviewer has authorized Codex review for this PR:

```bash
PR_NUMBER="${PR_NUMBER:?set the pull request number}"
gh pr comment "$PR_NUMBER" --repo djm204/frankenbeast --body "@codex review"
```

Then poll issue comments, PR reviews, inline comments, and review threads from `chatgpt-codex-connector`. Treat these states as blockers, not clean results:

- silence or only an `eyes` reaction,
- usage-limit text,
- unresolved current-head inline findings,
- a clean comment that predates your latest push.

When Codex reports findings, fix only the issue-scoped problem, push, reply to the finding, resolve the mapped review thread, and trigger another current-head review. Stop at the configured review-invocation cap and ask for HITL approval before exceeding it.

### 9. Merge or hand off

Merge only when all required checks are green and Codex is clean for the current head:

```bash
PR_NUMBER="${PR_NUMBER:?set the pull request number}"
VERIFIED_HEAD="$(gh pr view "$PR_NUMBER" --repo djm204/frankenbeast --json headRefOid --jq .headRefOid)"
gh pr checks "$PR_NUMBER" --repo djm204/frankenbeast --watch && \
gh pr merge "$PR_NUMBER" --repo djm204/frankenbeast --squash --delete-branch --match-head-commit "$VERIFIED_HEAD"
```

If you are not authorized to merge, leave a handoff comment with current head SHA, CI status, Codex status, verification already run, and the exact next safe command.

### 10. Close out and record reusable lessons

After merge or a real blocker:

```bash
git status --short --branch
```

Append a compact reusable lesson to `tasks/resolve-issues-shared-lessons.md` only when you learned something future workers should apply. Do not record stale progress, PR numbers, or raw credentials.

## HITL stop conditions

Stop for PM/HITL review instead of retrying side effects when:

- a command would push, merge, delete a branch, close an issue, edit labels, or rerun over the Codex cap without prior authorization;
- the issue scope expands into a second issue, architecture decision, migration, or security-sensitive behavior;
- local worktree state includes unrelated staged/dirty files you cannot safely separate;
- GitHub auth, CI permissions, or Codex availability are missing or usage-limited;
- the next action would require secrets or access to production systems.

A good stop message names the exact blocker, the current branch/head SHA, commands already run, and the next safe command for the reviewer.