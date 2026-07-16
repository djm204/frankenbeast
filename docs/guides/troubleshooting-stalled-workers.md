# Troubleshooting stalled workers

Use this guide when a PM, liveness monitor, or operator sees a worker that has stopped making visible progress. The goal is to classify the worker before taking action so recovery does not duplicate PRs, overwrite active work, or hide a real blocker.

## Fast triage checklist

1. **Identify the owner and scope.** Record the Kanban task id, issue number, branch, worktree path, linked PR, and current assignee.
2. **Read the live task state.** Inspect the task status, latest run, comments, parent handoff, PID, and heartbeat timestamp before editing files or spawning a replacement.
3. **Check for active ownership.** Compare the task branch and issue number with open PRs and existing worktrees. If a PR already owns the issue, resume that PR instead of creating a second branch.
4. **Classify the stall.** Use the status table below to decide whether the worker is active, blocked, stale, or unsafe to touch.
5. **Record the decision.** Leave a comment or handoff with the evidence, exact next action, and any blocked command or external gate.

## Classification table

| Signal | Classification | Safe next action |
| --- | --- | --- |
| Recent heartbeat, live PID, or fresh PR/CI/Codex activity | Active worker | Do not respawn. Nudge only with a specific next step if the worker is clearly idle. |
| `blocked` status with a concrete reason such as usage limits, denied approval, missing credentials, or review-required | Blocked worker | Resolve the named blocker or wait for the requested human decision; do not bypass the gate. |
| No live PID, stale heartbeat, no recent comments, and no linked PR or dirty worktree with unpushed changes | Stale worker | Reclaim or respawn from the recorded task context, then re-check issue/PR ownership before editing. |
| Dirty worktree, ahead commits, open PR, unresolved Codex thread, or in-flight CI on the same branch | In-flight recovery | Continue from that branch/worktree and preserve evidence; do not start a parallel implementation. |
| Unknown state, conflicting ownership evidence, or mutation approval ambiguity | Unsafe to touch | Freeze destructive actions and escalate with the exact evidence needed to choose an owner. |

## Read-only evidence to collect first

Prefer read-only inspection until the classification is clear:

```bash
# Replace values with the affected task, worktree, and repository.
hermes kanban show <task-id> --json
git -C <worktree> status --short --branch
git -C <worktree> log --oneline --decorate -5
gh pr list --repo djm204/frankenbeast --state open --search "<issue-number> in:body" --json number,title,headRefName,headRefOid,url,statusCheckRollup
```

If the task has an open PR, also inspect review and CI state before changing code:

```bash
gh pr view <pr-number> --repo djm204/frankenbeast --json number,state,mergeStateStatus,headRefName,headRefOid,reviewDecision,statusCheckRollup,url
gh pr checks <pr-number> --repo djm204/frankenbeast
```

## Recovery actions by outcome

### Active worker

- Do not create a duplicate card, branch, worktree, or PR.
- If progress is unclear, leave a narrow comment naming the exact missing next step, such as "poll Codex review for PR #123" or "push the already-committed branch".
- Re-check later instead of force-stopping the worker.

### Blocked worker

- Treat usage-limit comments, denied approval prompts, missing credentials, and explicit `review-required:` handoffs as blockers, not failures.
- Preserve the blocked command, tests already run, current head SHA, and remaining gate.
- Resume only after the blocker is resolved or a human records an explicit override.

### Stale worker

- Confirm there is no live PID, fresh heartbeat, open PR, or dirty/ahead worktree for the issue.
- Reclaim or unblock the task through the Kanban workflow with a comment explaining the stale evidence.
- Start from the recorded issue branch and shared lessons, then re-run ownership checks before editing.

### In-flight recovery

- Continue from the existing branch/worktree.
- Inspect local ahead/behind state before pushing; use `--force-with-lease` only when intentionally replacing a known stale remote head.
- If Codex or CI is already in progress, poll the current round instead of triggering duplicate review requests.

## Edge cases that must stay explicit

- Do not merge on Codex silence, usage-limit text, or an all-clear from an older head.
- Do not respawn a worker just because a PM liveness file is stale; verify the live Kanban task and PR state first.
- Do not delete dirty worktrees until their commits are pushed, abandoned by an explicit owner decision, or safely copied into the recovery handoff.
- Do not broaden a one-issue worker into adjacent issues while recovering it.

## Handoff template

```text
Stalled-worker triage for <task-id> / issue #<number>
Classification: active | blocked | stale | in-flight recovery | unsafe
Evidence: <PID/heartbeat, task status, branch/worktree, PR/CI/Codex state>
Decision: <resume existing PR, unblock/reclaim, wait for approval, or escalate>
Next safe command: <single command or "none until human decision">
Owner: <profile/person expected to act next>
```
