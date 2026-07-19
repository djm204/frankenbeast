---
title: Fork and branch recovery for first contributors
description: Safely recover an outdated fork, work started on the wrong branch, a rejected push, or a conflicted rebase without losing local changes.
---

# Fork and branch recovery for first contributors

Use this guide when the normal contributor flow stops because your fork is behind, you edited the wrong branch, or GitHub rejects your push. The commands below preserve local work and keep the issue on one focused branch. If you have not started editing yet, return to the [contributor guide](../../CONTRIBUTING.md) instead.

Run every command from the repository root. Set these examples once in the terminal, replacing both values for your issue:

```bash
ISSUE_NUMBER="1234"
BRANCH_NAME="docs/issue-${ISSUE_NUMBER}-short-description"
```

## Confirm your remotes and save local work

First inspect the checkout. A typical fork has `origin` pointing to your fork and `upstream` pointing to `djm204/frankenbeast`.

```bash
git status --short --branch
git remote -v
git branch --show-current
```

If `upstream` is missing, add the public repository and verify it before continuing:

```bash
git remote add upstream https://github.com/djm204/frankenbeast.git
git remote -v
```

Do not switch, reset, or rebase over uncommitted work. Save it first, including new files:

```bash
git stash push -u -m "wip: issue-${ISSUE_NUMBER} before branch recovery"
git stash list
```

Keep the stash until the recovered branch contains all expected changes.

## Bring an untouched branch up to date

If you have not committed issue work yet, create a fresh branch from current upstream `main`:

```bash
git fetch upstream main
git switch -c "$BRANCH_NAME" upstream/main
git status --short --branch
```

Restore saved edits only after you are on the issue branch:

```bash
git stash pop
```

If the issue branch already contains your commits, update that branch without merging unrelated work:

```bash
git fetch upstream main
git switch "$BRANCH_NAME"
git rebase upstream/main
```

When a rebase reports conflicts, edit only the named files, then run `git add <resolved-files>` and `git rebase --continue`. Use `git rebase --abort` to return to the pre-rebase state when you are unsure how to resolve a conflict.

## Recover work made on the wrong branch

If your uncommitted edits are still present on `main` or another branch, create the issue branch in place. `git switch -c` carries the working tree into the new branch:

```bash
git status --short --branch
git switch -c "$BRANCH_NAME"
git status --short --branch
```

If you already committed the work on the wrong local branch, create the issue branch at that commit before changing anything else:

```bash
git log -3 --oneline
git switch -c "$BRANCH_NAME"
```

Verify that the issue branch contains only the intended commits and files:

```bash
git log --oneline upstream/main..HEAD
git diff --stat upstream/main...HEAD
git diff --check upstream/main...HEAD
```

## Handle a rejected push

For a new issue branch, publish the current branch to your fork:

```bash
git push --set-upstream origin HEAD
```

If GitHub says the remote branch already exists or is ahead, fetch it and inspect both sides before changing history:

```bash
git fetch origin
git status --short --branch
BRANCH_NAME="$(git branch --show-current)"
git log --oneline HEAD.."origin/$BRANCH_NAME"
git log --oneline "origin/$BRANCH_NAME"..HEAD
```

If the remote commits are yours and belong to the same issue, replay your local commits on top of them, rerun the relevant checks, and push normally:

```bash
git pull --rebase origin "$BRANCH_NAME"
git push
```

Do not use `git push --force`. Do not use `--force-with-lease` unless a maintainer explicitly asks you to rewrite that issue branch after reviewing the exact commits that would be replaced. A rejected push can mean another contributor owns the remote branch; check the issue and open pull requests before proceeding.

## Ask for help before continuing when

Stop and use the [first-contribution help guide](getting-help.md) when:

- `origin` or `upstream` points somewhere you do not recognize;
- the branch contains commits or files from another issue;
- a stash, rebase, or conflict resolution appears to have dropped work;
- the remote branch has commits you did not create;
- the recovery would require resetting a shared branch, deleting a branch, or force-pushing; or
- you cannot explain the output of `git log upstream/main..HEAD`.

Include the redacted output of `git status --short --branch`, `git remote -v`, and the two-sided `git log` commands. Never paste tokens, credential-bearing remote URLs, `.env` contents, or private repository names into a public thread.
