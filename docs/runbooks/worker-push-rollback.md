# Worker push rollback runbook

Use this runbook when a worker push fails midway, a force-with-lease update is denied, or a worker branch lands commits that must be rolled back before the PR can continue. The goal is to preserve evidence, identify the intended last-good commit, and route the risky rollback through approval-cop/HITL instead of running ad-hoc force pushes.

## Scope and safety rules

- Applies to worker-owned feature/issue branches, not `main` or release tags.
- Treat branch rewrites as destructive. Never run `git push --force`, `git push --force-with-lease`, branch deletion, or equivalent GitHub mutation directly from a worker shell.
- Use approval-cop/HITL for the rollback command after evidence and the last-good commit are reviewed.
- Prefer a normal merge/revert commit when it preserves the PR history safely. Use branch rollback only when the remote branch itself needs to be restored to a prior commit.

## 1. Diagnose the failure shape

Record which case you are handling:

- Push failed before the remote moved.
- Push failed because the remote moved unexpectedly.
- Push succeeded, but the branch contains bad commits.
- PR state is inconsistent with the local worktree after a rebase or takeover.

Capture the local state before making changes:

```bash
git status --short --branch
git branch --show-current
git log --oneline --decorate --graph -20
```

If a PR already exists, capture it too:

```bash
gh pr view <pr-number> --repo <owner>/<repo> \
  --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup,url
```

## 2. Capture current remote evidence

Create an evidence directory that can be attached to a handoff or postmortem:

```bash
mkdir -p rollback-evidence/<branch-slug>
git ls-remote --heads origin refs/heads/<branch> | tee rollback-evidence/<branch-slug>/remote-head.txt
gh pr view <pr-number> --repo <owner>/<repo> \
  --json number,title,state,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup,url \
  > rollback-evidence/<branch-slug>/pr-state.json
git fetch --no-tags origin refs/heads/<branch>:refs/remotes/origin/<branch>
git log --oneline --decorate --graph <last-good>..refs/remotes/origin/<branch> \
  > rollback-evidence/<branch-slug>/commits-to-remove.txt
```

The SHA in `remote-head.txt` is the lease value. Do not proceed if it changes between evidence capture and approval.

## 3. Select and verify the last-good ref

Choose the last-good ref from one of these sources, in order of preference:

1. The PR's last reviewed clean head.
2. The last CI-green commit before the bad publish.
3. The parent of the first bad commit on the worker branch.
4. `origin/main` only when the correct recovery is to reset the branch back to the base.

Verify it resolves to a commit:

```bash
git rev-parse --verify '<last-good>^{commit}'
git merge-base --is-ancestor '<last-good>' HEAD
```

If the ancestry check fails, stop: the selected last-good ref is not an ancestor of the current head and needs human review before any rollback command is submitted.

Keep the resolved SHA in the evidence bundle. If the last-good commit is ambiguous, stop and ask for a human decision on the Kanban card or PR.

## 4. Generate a dry-run rollback plan

The helper prints the exact read-only evidence commands, approval-gated rollback command, and post-rollback verification steps. It never executes the rollback.

```bash
node scripts/worker-push-rollback-plan.mjs \
  --dry-run \
  --branch <branch> \
  --last-good <last-good-ref> \
  --repo <owner>/<repo> \
  --pr <pr-number>
```

When you already captured the two SHAs, include them so the printed force-with-lease command is concrete:

```bash
node scripts/worker-push-rollback-plan.mjs \
  --dry-run \
  --branch <branch> \
  --last-good <last-good-ref> \
  --repo <owner>/<repo> \
  --pr <pr-number> \
  --remote-head-oid <current-remote-head-sha> \
  --last-good-oid <resolved-last-good-sha>
```

## 5. Route the dangerous command through approval-cop

The dry-run helper will print a command shaped like this:

```bash
approval-cop run -- git push \
  --force-with-lease=refs/heads/<branch>:<current-remote-head-sha> \
  origin \
  <resolved-last-good-sha>:refs/heads/<branch>
```

Only submit that command after the evidence bundle and last-good selection are reviewed. Do not reshape the command to bypass approval-cop if approval is denied or pending.

## 6. Verify the rollback

After approval-cop executes the rollback, verify the remote and PR state:

```bash
git ls-remote --heads origin refs/heads/<branch>
gh pr view <pr-number> --repo <owner>/<repo> \
  --json headRefOid,mergeStateStatus,statusCheckRollup,url
gh pr checks <pr-number> --repo <owner>/<repo>
```

The remote head must match the resolved last-good SHA. If the PR head changed, any previous CI or Codex clean for the old head is stale; rerun the required gates for the current head.

## 7. Update the PR and postmortem trail

Post a concise PR comment with:

- What failed.
- The captured remote head before rollback.
- The selected last-good SHA and why it was selected.
- The approval-cop command outcome or approval token reference.
- Verification commands and results.
- Any follow-up CI/Codex review required for the new head.

If the rollback is part of a Kanban worker recovery, also add a Kanban comment with the same evidence summary before blocking or completing the card.
