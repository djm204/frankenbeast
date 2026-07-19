---
title: After your first pull request
description: Verify a merged contribution, safely clean up its branch, update your fork, and choose the next Frankenbeast task.
---

# After your first pull request

Use this guide after your first Frankenbeast pull request is merged. It closes the contribution loop without deleting unmerged work or leaving your next branch based on an outdated fork.

## 1. Confirm the pull request and issue are finished

Do not delete a branch because CI passed or a review was approved. First verify that GitHub reports the pull request as merged and that its linked issue is closed:

```bash
REPO="djm204/frankenbeast"
PR_NUMBER="123" # replace with your merged pull request
ISSUE_NUMBER="2527" # replace with the issue it closed

gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json state,mergedAt,mergeCommit,url
gh issue view "$ISSUE_NUMBER" --repo "$REPO" \
  --json state,url
```

Expect `state` to be `MERGED` for the pull request, a non-null `mergedAt`, and `state` to be `CLOSED` for the issue. If the issue is still open, check that the pull-request body used `Closes #<issue-number>` and ask in the pull request before closing anything manually.

## 2. Save the branch name and inspect local work

Run these commands from your Frankenbeast checkout while you are still on the contribution branch:

```bash
CONTRIBUTION_BRANCH="$(git branch --show-current)"
printf 'Contribution branch: %s\n' "$CONTRIBUTION_BRANCH"
git status --short --branch
git log --oneline --decorate -3
```

Stop if `CONTRIBUTION_BRANCH` is empty, equals `main`, or `git status` shows changes you still need. Commit, stash, or move intentional work before switching branches. Never use `git clean -fd` as a first-contribution cleanup shortcut because it permanently removes untracked files.

## 3. Update your local main branch

Most external contributors have `origin` pointing to their fork and `upstream` pointing to `djm204/frankenbeast`. Verify rather than assume:

```bash
git remote -v
git fetch --prune upstream main
git switch main
git merge --ff-only upstream/main
```

The `--ff-only` guard stops instead of creating an unexpected merge commit. If it fails because local `main` has commits or `upstream` is missing, use the [fork and branch recovery guide](fork-and-branch-recovery.md) rather than resetting or force-pushing.

Contributors who intentionally cloned the upstream repository and do not have an `upstream` remote can update from `origin` instead:

```bash
git fetch --prune origin main
git switch main
git merge --ff-only origin/main
```

## 4. Synchronize your fork

If `origin` is your fork, publish the updated `main` with a normal push:

```bash
git push origin main
```

Do not force-push `main`. If Git rejects the push, stop and inspect the remotes and branch history with the [fork and branch recovery guide](fork-and-branch-recovery.md).

## 5. Delete only the merged contribution branch

With the merged state already verified and your saved branch name still set, first try the non-destructive local deletion:

```bash
git branch -d "$CONTRIBUTION_BRANCH"
```

The lowercase `-d` refuses to delete a branch Git does not consider merged. This commonly happens after a squash merge because `main` contains a new squash commit instead of the branch's exact commits. Do not immediately change `-d` to uppercase `-D`. First prove that the local branch still matches the head GitHub merged:

```bash
PR_NUMBER="123" # replace with your merged pull request
PR_HEAD="$(gh pr view "$PR_NUMBER" --repo djm204/frankenbeast \
  --json headRefOid --jq '.headRefOid')"
LOCAL_HEAD="$(git rev-parse "$CONTRIBUTION_BRANCH")"

if [ "$LOCAL_HEAD" != "$PR_HEAD" ]; then
  printf 'Stop: local branch %s does not match merged PR head %s.\n' \
    "$LOCAL_HEAD" "$PR_HEAD" >&2
  exit 1
fi

git branch -D "$CONTRIBUTION_BRANCH"
```

Use this uppercase deletion only when the pull request is verified as merged, the issue is closed, the worktree is clean, and the two full commit IDs match. A mismatch means the local branch contains work GitHub did not merge.

GitHub may already have deleted the remote branch. Check before requesting deletion from your fork:

```bash
if git ls-remote --exit-code --heads origin "$CONTRIBUTION_BRANCH" >/dev/null 2>&1; then
  git push origin --delete "$CONTRIBUTION_BRANCH"
else
  printf 'Remote branch is already absent; nothing to delete.\n'
fi
git fetch --prune origin
```

If you used a Git worktree, remove it only after saving any intentional changes and switching to a different directory:

```bash
WORKTREE_PATH="../frankenbeast-issue-2527" # replace with the actual worktree path
git worktree list
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

Do not add `--force` to worktree removal. A refusal usually means the worktree still contains changes worth reviewing.

## 6. Start the next contribution from current main

Before selecting another issue, confirm that the checkout is clean and current:

```bash
git status --short --branch
git log -1 --oneline
gh issue list --repo djm204/frankenbeast \
  --state open --label "good first issue" --limit 20
```

Choose one unclaimed issue, recheck its discussion and open pull requests, then create a new branch from the updated `main`. Do not reuse the merged branch for unrelated work. Return to the [contributor guide](../../CONTRIBUTING.md) for the complete issue-selection and first-PR workflow.

## Cleanup checklist

- [ ] The pull request is `MERGED`, not merely approved or green.
- [ ] The linked issue is closed.
- [ ] Intentional local changes are committed, stashed, or moved.
- [ ] Local `main` matches the current upstream `main`.
- [ ] Your fork's `main` was updated without a force-push.
- [ ] Only the merged contribution branch (matching the PR's full head commit ID) and its clean worktree were removed.
- [ ] The next issue starts on a new branch from current `main`.
