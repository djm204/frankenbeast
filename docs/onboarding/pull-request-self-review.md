---
title: Pull request self-review checklist
description: Review the exact files, commits, verification evidence, and GitHub pull request a maintainer will see before requesting review.
---

# Pull request self-review checklist

Use this guide after implementing and testing one issue, but before requesting review. A focused self-review catches accidental files, stale evidence, branch mistakes, and missing context while they are still easy to fix.

## 1. Confirm the issue and branch scope

Set the issue and repository, reread the acceptance criteria, and confirm that another open pull request did not claim the same work while you were implementing:

```bash
REPO="djm204/frankenbeast"
ISSUE_NUMBER="2526" # replace with your issue

gh issue view "$ISSUE_NUMBER" --repo "$REPO"
gh pr list --repo "$REPO" --state open --limit 100 \
  --search "$ISSUE_NUMBER OR issue-$ISSUE_NUMBER" \
  --json number,title,headRefName,url
git branch --show-current
git status --short --branch
```

Stop if the issue is closed, another active pull request covers it, you are on `main`, or the branch contains work for a second issue. Ask in the issue or pull request instead of creating duplicate work.

Choose the base that matches your checkout and fetch it before comparing:

```bash
# Fork checkout: origin is your fork and upstream is djm204/frankenbeast.
git fetch upstream main
BASE_REF="upstream/main"

# Direct upstream checkout: use these two lines instead.
# git fetch origin main
# BASE_REF="origin/main"
```

Do not reset, rebase, or force-push just because the base moved. If the branch needs recovery, use the [fork and branch recovery guide](fork-and-branch-recovery.md).

## 2. Review every local change

Review uncommitted changes first. Stage only the intended paths or hunks, then review the staged patch before committing:

```bash
git status --short
git diff --check
git diff --stat
git diff
git add -p
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Do not use `git add .` for convenience. It can stage generated output, local configuration, or another task's work. For an intentional untracked file, use `git add --intent-to-add path/to/file` before `git add -p`, or stage that exact path after reviewing it.

After committing, review the complete branch rather than only the last commit:

```bash
git diff --check "$BASE_REF...HEAD"
git diff --stat "$BASE_REF...HEAD"
git diff "$BASE_REF...HEAD"
git log --oneline "$BASE_REF..HEAD"
git diff --name-status "$BASE_REF...HEAD"
```

For every changed file, be able to explain why it is needed for this issue. Remove drive-by formatting, unrelated refactors, debug output, editor files, and generated artifacts. Confirm each commit subject follows the repository's Conventional Commit format.

## 3. Check for unsafe or accidental files

Inspect the changed-path list for local state and sensitive material. Do not commit files such as:

- `.env` or other credential-bearing environment files;
- `.fbeast/` runtime state, local databases, logs, traces, or coverage output;
- provider keys, tokens, cookies, private issue text, or customer data;
- editor caches, dependency folders, build output, screenshots with secrets, or personal audit artifacts.

A clean secret scanner does not make an unexpected file safe. Read every changed file and verify that examples use obvious placeholders rather than realistic credentials. If sensitive data was committed or pushed, stop and follow the repository's security guidance; deleting it in a later commit does not remove it from history.

Also check the shape of the change:

- public behavior, commands, configuration, and workflows have matching docs;
- behavior changes have focused regression coverage;
- new documentation pages have `title` and `description` frontmatter and are linked from the nearest index;
- renamed or deleted files do not leave broken imports or links;
- test fixtures are minimal and contain no real production data.

## 4. Rerun and record verification

Use the [test command decision tree](test-command-decision-tree.md) to choose the narrowest meaningful checks, then run the package or root gates required by the change. Run checks against the final committed content, not an earlier draft.

Record the exact command and real outcome as you run it:

```text
- `npm run test:root -- tests/docs-issue-2526.test.ts` — passed
- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm run build` — passed
```

Replace the examples with your actual commands. Do not claim a skipped or failed check passed. If a relevant gate cannot run, state the exact blocker and any narrower check that did run. Never paste secrets, private logs, or unredacted environment output as evidence.

After the final verification, confirm that tests did not modify the branch:

```bash
git status --short --branch
git diff --check "$BASE_REF...HEAD"
```

## 5. Inspect the pull request GitHub will review

Push the reviewed branch and open the pull request using the [contributor guide](../../CONTRIBUTING.md). The body should explain the gap, summarize the focused solution, list only real verification results, and include the closing line:

```text
Closes #<issue-number>
```

Before requesting review, inspect the GitHub representation rather than assuming the local branch and form were correct:

```bash
PR_NUMBER="123" # replace with your pull request

gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json title,body,baseRefName,headRefName,headRefOid,files,url
gh pr diff "$PR_NUMBER" --repo "$REPO"
gh pr checks "$PR_NUMBER" --repo "$REPO"
```

Verify that the base is `main`, the head is the intended issue branch, the title is a Conventional Commit, the file list matches your local review, and the body closes only the selected issue. If the title or body is wrong, update it. If the head branch is wrong, close the pull request and recreate it from the correct branch; GitHub cannot change a pull request's head branch.

CI and reviews apply to the current head. After any push, rerun affected local checks, update the evidence when needed, inspect the complete pull-request diff again, and wait for current-head CI and required review before merge.

## Ready-for-review checklist

- [ ] The issue is still the correct source of scope and no duplicate pull request exists.
- [ ] The branch contains one issue's work and no unrelated files or commits.
- [ ] Every changed file was reviewed in the complete base-to-head diff.
- [ ] No credentials, local runtime state, generated output, or private data is included.
- [ ] Tests and docs cover the changed behavior or workflow.
- [ ] Verification evidence lists exact commands and honest outcomes.
- [ ] The pull request targets `main`, uses the intended head branch, and has a Conventional Commit title.
- [ ] The pull-request body explains why, summarizes what changed, and includes `Closes #<issue-number>`.
- [ ] CI and required review are green for the current head commit.
