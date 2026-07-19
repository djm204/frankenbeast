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

## 2. Save and verify the contribution branch

Run these commands from your Frankenbeast checkout while you are still on the contribution branch:

```bash
CONTRIBUTION_BRANCH="$(git branch --show-current)"
CONTRIBUTION_ROOT="$(git rev-parse --show-toplevel)"
LOCAL_HEAD="$(git rev-parse HEAD)"
PR_BRANCH="$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefName --jq '.headRefName')"
PR_HEAD="$(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefOid --jq '.headRefOid')"

printf 'Contribution branch: %s\nMerged PR branch: %s\nLocal head: %s\nMerged PR head: %s\n' \
  "$CONTRIBUTION_BRANCH" "$PR_BRANCH" "$LOCAL_HEAD" "$PR_HEAD"
git status --short --branch
git log --oneline --decorate -3

if [ -z "$CONTRIBUTION_BRANCH" ] || [ "$CONTRIBUTION_BRANCH" = "main" ]; then
  printf 'Stop: expected to be on the merged contribution branch.\n' >&2
  exit 1
fi

if [ "$CONTRIBUTION_BRANCH" != "$PR_BRANCH" ]; then
  printf 'Stop: current branch is not the branch GitHub merged.\n' >&2
  exit 1
fi

if [ "$LOCAL_HEAD" != "$PR_HEAD" ]; then
  printf 'Stop: local head does not match the head GitHub merged.\n' >&2
  exit 1
fi
```

Stop if `git status` shows changes you still need. Commit, stash, or move intentional work before continuing. The full commit-ID comparison must happen before any local or remote branch deletion: a later commit on the same branch is not part of the merged pull request. Never use `git clean -fd` as a first-contribution cleanup shortcut because it permanently removes untracked files.

## 3. Leave or remove the contribution checkout

Choose the path that matches your checkout.

### Ordinary checkout

If `.git` is a directory in `CONTRIBUTION_ROOT`, switch away from the contribution branch before deleting it:

```bash
PRIMARY_CHECKOUT="$CONTRIBUTION_ROOT"
git switch main
```

### Linked issue worktree

If `.git` is a file in `CONTRIBUTION_ROOT`, the branch is checked out by a linked worktree. Git will refuse to delete that branch while the worktree exists. Inspect the list, then set `PRIMARY_CHECKOUT` to the primary checkout shown on its first line:

```bash
test -f "$CONTRIBUTION_ROOT/.git"
git worktree list
PRIMARY_CHECKOUT="/absolute/path/to/your/primary/frankenbeast/checkout"

if [ "$PRIMARY_CHECKOUT" = "$CONTRIBUTION_ROOT" ] || \
  ! git -C "$PRIMARY_CHECKOUT" rev-parse --show-toplevel >/dev/null 2>&1; then
  printf 'Stop: PRIMARY_CHECKOUT must name the separate primary checkout.\n' >&2
  exit 1
fi

printf 'Review ignored files that worktree removal would also delete:\n'
git -C "$CONTRIBUTION_ROOT" status --short --ignored
git -C "$CONTRIBUTION_ROOT" clean -ndX
```

The dry run commonly lists disposable build output and dependencies, but it can also reveal ignored local state such as `.env`, `.fbeast/`, `dist/`, or `coverage/`. Copy any ignored secrets, configuration, evidence, or state you still need to a safe directory outside the worktree. Do not share their contents in an issue or pull request. After reviewing and preserving both tracked and ignored files, continue from outside the issue worktree:

```bash
cd "$PRIMARY_CHECKOUT"
git worktree remove "$CONTRIBUTION_ROOT"
git worktree prune
```

Do not add `--force` to worktree removal. A refusal usually means the worktree still contains changes worth reviewing. Resolve those changes from the worktree and repeat the head and status checks before trying again.

## 4. Update your local main branch

Most external contributors have `origin` pointing to their fork and `upstream` pointing to `djm204/frankenbeast`. Verify rather than assume:

```bash
git -C "$PRIMARY_CHECKOUT" remote -v
git -C "$PRIMARY_CHECKOUT" fetch --prune upstream main || exit 1
git -C "$PRIMARY_CHECKOUT" switch main || exit 1
test "$(git -C "$PRIMARY_CHECKOUT" branch --show-current)" = "main" || exit 1
git -C "$PRIMARY_CHECKOUT" merge --ff-only upstream/main || exit 1
```

The `--ff-only` guard stops instead of creating an unexpected merge commit. If it fails because local `main` has commits, another worktree owns `main`, or `upstream` is missing, use the [fork and branch recovery guide](fork-and-branch-recovery.md) rather than resetting or force-pushing.

Contributors who intentionally cloned the upstream repository and do not have an `upstream` remote can update from `origin` instead:

```bash
git -C "$PRIMARY_CHECKOUT" fetch --prune origin main || exit 1
git -C "$PRIMARY_CHECKOUT" switch main || exit 1
test "$(git -C "$PRIMARY_CHECKOUT" branch --show-current)" = "main" || exit 1
git -C "$PRIMARY_CHECKOUT" merge --ff-only origin/main || exit 1
```

## 5. Synchronize your fork

If `origin` is your fork, publish the updated `main` with a normal push:

```bash
git -C "$PRIMARY_CHECKOUT" push origin main
```

Do not force-push `main`. If Git rejects the push, stop and inspect the remotes and branch history with the [fork and branch recovery guide](fork-and-branch-recovery.md).

## 6. Delete only the verified merged branch

The pull request is confirmed merged, the local branch head was matched to the pull-request head, and no worktree now holds the branch. Try Git's non-destructive deletion first:

```bash
DELETE_HEAD="$(git -C "$PRIMARY_CHECKOUT" rev-parse \
  "refs/heads/$CONTRIBUTION_BRANCH")"
if [ "$DELETE_HEAD" != "$PR_HEAD" ]; then
  printf 'Stop: contribution branch changed after the earlier head check.\n' >&2
  exit 1
fi

if ! git -C "$PRIMARY_CHECKOUT" branch -d "$CONTRIBUTION_BRANCH"; then
  printf 'A squash merge can require deletion after the verified head check.\n'
  git -C "$PRIMARY_CHECKOUT" branch -D "$CONTRIBUTION_BRANCH"
fi
```

The uppercase fallback is safe here only because the earlier checks proved that the worktree was clean and the local branch's full commit ID was exactly the head GitHub merged. Do not use it if those checks were skipped or failed.

GitHub may already have deleted the remote branch. If it remains, compare its current full commit ID with the merged PR head before requesting deletion from your fork:

```bash
REMOTE_OUTPUT=""
EXPECTED_REMOTE_REF="refs/heads/$CONTRIBUTION_BRANCH"
if REMOTE_OUTPUT="$(git -C "$PRIMARY_CHECKOUT" ls-remote --exit-code --refs \
  origin "$EXPECTED_REMOTE_REF" 2>&1)"; then
  REMOTE_LOOKUP_STATUS=0
else
  REMOTE_LOOKUP_STATUS=$?
fi

if [ "$REMOTE_LOOKUP_STATUS" -eq 2 ]; then
  printf 'Remote branch is already absent; nothing to delete.\n'
elif [ "$REMOTE_LOOKUP_STATUS" -ne 0 ]; then
  printf 'Stop: remote branch lookup failed: %s\n' "$REMOTE_OUTPUT" >&2
  exit "$REMOTE_LOOKUP_STATUS"
else
  REMOTE_MATCHES="$(printf '%s\n' "$REMOTE_OUTPUT" | \
    awk -v expected="$EXPECTED_REMOTE_REF" '$2 == expected { print $1 }')"
  REMOTE_MATCH_COUNT="$(printf '%s\n' "$REMOTE_MATCHES" | \
    awk 'NF { count++ } END { print count + 0 }')"
  if [ "$REMOTE_MATCH_COUNT" -ne 1 ] || [ "$REMOTE_MATCHES" != "$PR_HEAD" ]; then
    printf 'Stop: exact remote branch does not uniquely match the merged PR head.\n' >&2
    exit 1
  fi
  git -C "$PRIMARY_CHECKOUT" push origin --delete "$CONTRIBUTION_BRANCH"
fi

git -C "$PRIMARY_CHECKOUT" fetch --prune origin
```

## 7. Start the next contribution from current main

Before selecting another issue, confirm that the checkout is clean and current:

```bash
git -C "$PRIMARY_CHECKOUT" status --short --branch
git -C "$PRIMARY_CHECKOUT" log -1 --oneline
gh issue list --repo djm204/frankenbeast \
  --state open --label "good first issue" --limit 20
```

Choose one unclaimed issue, recheck its discussion and open pull requests, then create a new branch from the updated `main`. Do not reuse the merged branch for unrelated work. Return to the [contributor guide](../../CONTRIBUTING.md) for the complete issue-selection and first-PR workflow.

## Cleanup checklist

- [ ] The pull request is `MERGED`, not merely approved or green.
- [ ] The linked issue is closed.
- [ ] Intentional local changes are committed, stashed, or moved.
- [ ] The local and remote branch heads were compared with the merged PR head before deletion.
- [ ] A linked worktree was removed before its branch.
- [ ] Local `main` matches the current upstream `main`.
- [ ] Your fork's `main` was updated without a force-push.
- [ ] Only the verified merged contribution branch and its clean worktree were removed.
- [ ] The next issue starts on a new branch from current `main`.
