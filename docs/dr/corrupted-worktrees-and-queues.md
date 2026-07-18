# Corrupted worktrees and queues incident runbook

Use this runbook when Git worktrees, Kanban task queues, approval-cop queues, dead-letter queues, dispatcher workers, or coordination/liveness state look inconsistent. It is a focused repair companion to the [incident command checklist](incident-command-checklist.md): keep diagnosis read-only first, make a backup before every repair, and route any destructive command through approval-cop/HITL.

## Scope and safety rules

In scope:

- Git worktrees with missing `.git` metadata, stale branch pointers, dirty unrelated files, failed checkouts, or mismatched local/remote heads.
- Kanban cards stuck in impossible states such as `running` with no live PID, `ready` while an active PR already owns the issue, duplicate workers for one issue, or parent/child dependency mismatches.
- Approval-cop or HITL queues with stale, replayed, malformed, or already-executed commands.
- Disaster-recovery dead-letter queues with retry-exhausted actions that need classify/retire/replay decisions.
- Dispatcher/liveness state that disagrees with live processes, worktrees, PRs, or cron monitors.

Out of scope:

- Production restore execution. Use [restore-preview](restore-preview.md) and keep `recoveryMode: true` until an incident commander approves a destructive restore plan.
- Worker branch rollback after a bad push. Use the [worker push rollback runbook](../runbooks/worker-push-rollback.md).
- Runtime config rollback. Use [runtime config rollback](runtime-config-rollback-plan.md).

Safety rules:

1. Assign one incident commander and one scribe before changing state.
2. Freeze broad worker respawns, branch deletion, force-pushes, queue replays, and restore executors until the failure class is known.
3. Collect read-only evidence before repairs.
4. Back up the affected live state before any repair command.
5. Mark and execute every destructive command as `HITL/approval-cop required`.
6. Never reshape a denied approval-cop command into a different shell form to bypass approval.
7. Close the incident only after worktree, queue, worker, PR, and liveness evidence agree.

## 1. Read-only diagnosis

Create an evidence bundle path first. Writing evidence under `/tmp` or an incident folder is allowed; do not mutate live state during this section.

```bash
INCIDENT_ID=<ticket-or-kanban-card>
EVIDENCE_DIR=/tmp/frankenbeast-dr-$INCIDENT_ID
umask 077
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
date -u +%Y-%m-%dT%H:%M:%SZ | tee "$EVIDENCE_DIR/started-at.txt"
```

Keep the evidence directory private before copying any Kanban DB, approval queue, dead-letter queue, command output, or user state into it. If an existing incident directory is reused, verify `stat -c '%a %U %G' "$EVIDENCE_DIR"` before capture and stop if it is not operator-owned and mode `700`.

### Worktree inventory

```bash
git -C <repo> worktree list --porcelain | tee "$EVIDENCE_DIR/worktrees.txt"
git -C <repo> branch --show-current | tee "$EVIDENCE_DIR/current-branch.txt"
git -C <repo> status --short --branch | tee "$EVIDENCE_DIR/main-status.txt"
```

For each suspect worktree:

```bash
git -C <worktree> status --short --branch | tee "$EVIDENCE_DIR/status-<name>.txt"
git -C <worktree> rev-parse --git-dir --show-toplevel | tee "$EVIDENCE_DIR/gitdir-<name>.txt"
git -C <worktree> rev-parse HEAD | tee "$EVIDENCE_DIR/head-<name>.txt"
git -C <worktree> rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1 | tee "$EVIDENCE_DIR/upstream-<name>.txt"
```

Healthy output examples:

```text
worktree /srv/frankenbeast/.worktrees/issue-1684
HEAD 39306c3d6c9a3d8d4a5f6b7c8d9e0f1234567890
branch refs/heads/resolve/issue-1684-docs-dr-add-incident-runbook-for-corrupted-workt

## resolve/issue-1684-docs-dr-add-incident-runbook-for-corrupted-workt...origin/main
```

Corrupted output examples:

```text
fatal: not a git repository: /srv/frankenbeast/.git/worktrees/issue-1684
```

```text
## resolve/issue-1684...origin/resolve/issue-1684 [ahead 3, behind 2]
 M packages/franken-orchestrator/src/cli/run.ts
?? unrelated-audit-output.json
```

```text
worktree /srv/frankenbeast/.worktrees/issue-1684
HEAD 0000000000000000000000000000000000000000
branch refs/heads/resolve/issue-1684
prunable gitdir file points to missing path
```

### Kanban and dispatcher inventory

Prefer the supported Kanban tooling or dashboard for reads. If the incident commander authorizes direct SQLite reads, keep them read-only.

```bash
hermes kanban show <task-id> --json | tee "$EVIDENCE_DIR/kanban-task.json"
hermes kanban list --status running --json | tee "$EVIDENCE_DIR/kanban-running.json"
pgrep -af 'hermes.*kanban|dispatcher|worker' | tee "$EVIDENCE_DIR/worker-processes.txt"
```

Healthy state example:

```json
{
  "id": "t_3f1c180d",
  "status": "running",
  "current_run_id": 5765,
  "events": [{ "kind": "heartbeat", "run_id": 5765 }]
}
```

Corrupted state examples:

```json
{
  "id": "t_3f1c180d",
  "status": "running",
  "current_run_id": 4745,
  "runs": [
    { "id": 4745, "status": "crashed", "error": "pid 3033920 not alive" }
  ]
}
```

```text
pgrep output is empty, but Kanban lists multiple running workers for the same issue and branch.
```

### Queue inventory

Approval-cop/HITL queues vary by deployment. Capture the configured queue path, pending command summaries, token age, approver, and exact command text without executing anything.

```bash
approval-cop status --json | tee "$EVIDENCE_DIR/approval-cop-status.json"
approval-cop pending --json | tee "$EVIDENCE_DIR/approval-cop-pending.json"
```

Disaster-recovery dead-letter queues are inspectable without side effects:

```bash
frankenbeast dr dead-letter-list <queue-file> | tee "$EVIDENCE_DIR/dead-letter-list.txt"
frankenbeast dr dead-letter-inspect <queue-file> <entry-id> | tee "$EVIDENCE_DIR/dead-letter-entry.txt"
frankenbeast dr dead-letter-replay-dry-run <queue-file> <entry-id> | tee "$EVIDENCE_DIR/dead-letter-dry-run.txt"
```

Healthy approval queue example:

```json
{
  "pending": [],
  "unsafe": [],
  "lastExecuted": [
    { "command": "git merge --squash ...", "approvedBy": "djm204" }
  ]
}
```

Corrupted queue examples:

```json
{
  "pending": [
    {
      "command": "git push --force origin HEAD:main",
      "ageMinutes": 1840,
      "workdirMissing": true
    }
  ],
  "unsafe": [
    { "reason": "command text changed after approval token was issued" }
  ]
}
```

```json
{
  "entryId": "retry-42",
  "classification": "side-effect-approval-required",
  "lastError": "network timeout after partial publish",
  "replayable": false
}
```

### Liveness and PR ownership inventory

```bash
gh pr list --repo <owner/repo> --state open --json number,title,headRefName,headRefOid,mergeStateStatus,statusCheckRollup,url | tee "$EVIDENCE_DIR/open-prs.json"
gh issue view <issue-number> --repo <owner/repo> --json number,state,labels,comments,url | tee "$EVIDENCE_DIR/issue.json"
```

Healthy liveness example:

```text
One running worker owns issue #1684, one matching worktree is on branch resolve/issue-1684-..., and no open PR already closes #1684.
```

Corrupted liveness examples:

```text
Two workers own issue #1684 on different worktrees.
A ready card is repeatedly respawn_guarded(active_pr) while PR #123 is already green and waiting only on a Codex gate.
The dispatcher reports healthy capacity, but all worker PIDs are gone and heartbeats are older than the stale timeout.
```

## 2. Back up before repair

Capture backups after diagnosis and before mutation. Keep backup locations private; do not paste raw DBs, queues, ledgers, or secrets into GitHub, Discord, or Kanban comments. Use [backup ownership and retention](backup-ownership-retention-policy.md) for retention and data-class handling.

Suggested backup commands:

```bash
sqlite3 <kanban-db> ".backup '$EVIDENCE_DIR/kanban-before-repair.db'"
cp -a <approval-queue-dir> "$EVIDENCE_DIR/approval-queue-before-repair"
cp -a <dead-letter-queue-file> "$EVIDENCE_DIR/dead-letter-before-repair.json"
git -C <repo> bundle create "$EVIDENCE_DIR/repo-before-repair.bundle" --all
```

If any suspect worktree is dirty, corrupt, or about to be removed, preserve the working tree separately because the Git bundle only captures commits and refs, not uncommitted or untracked files:

```bash
git -C <worktree> status --short --branch > "$EVIDENCE_DIR/worktree-<name>-status.txt" 2>&1 || true
git -C <worktree> diff > "$EVIDENCE_DIR/worktree-<name>-tracked.diff" 2>&1 || true
git -C <worktree> ls-files --others --exclude-standard -z > "$EVIDENCE_DIR/worktree-<name>-untracked.zlist" 2>/dev/null || true
tar --create --gzip --file "$EVIDENCE_DIR/worktree-<name>-snapshot.tgz" --directory <worktree> .
```

Do not run `git reset --hard`, `git clean`, or `git worktree remove --force` until the incident commander has reviewed those worktree artifacts and confirmed that the snapshot contains every uncommitted file that may matter.

If a backup command reads secret, user-private, or approval-token data, record only the backup path, digest, owner, and retention deadline in the incident log:

```bash
sha256sum "$EVIDENCE_DIR/kanban-before-repair.db" | tee "$EVIDENCE_DIR/kanban-before-repair.sha256"
```

Do not start repairs until the scribe records:

- artifact backed up;
- backup digest/path;
- data classification;
- retention deadline;
- approver for the planned repair.

## 3. Decision tree

```text
Start
 |
 |-- Is there a live owner with fresh heartbeat for this issue/PR/card?
 |     |-- yes: stop duplicate workers; post exact finish-line criteria; do not edit over it.
 |     `-- no: continue.
 |
 |-- Does an open PR already close the affected issue?
 |     |-- yes: drive PR gates (CI, Codex, unresolved threads) instead of creating a branch.
 |     `-- no: continue.
 |
 |-- Is the worktree corrupt, dirty with unrelated files, or detached from its branch?
 |     |-- yes: back up, then repair or replace the worktree with HITL/approval-cop for destructive cleanup.
 |     `-- no: continue.
 |
 |-- Is a queue entry stale, replayed, malformed, or classified side-effecting?
 |     |-- yes: back up, retire/quarantine/replay only through approval-cop with exact command evidence.
 |     `-- no: continue.
 |
 |-- Does Kanban/liveness disagree with live processes?
 |     |-- yes: back up the DB, then defer, unblock, replace, or complete cards with exact evidence.
 |     `-- no: resume the smallest focused worker and monitor verification.
```

## 4. Repair lanes

Run only the lane that matches the evidence. Every command in this section that mutates live state is marked `HITL/approval-cop required`.

### A. Worktree reset or replacement

Use when `.git` metadata is missing, the worktree points at a stale branch, dirty files are unrelated to the issue, or a checkout cannot be trusted.

Read-only precheck:

```bash
git -C <repo> worktree list --porcelain
git -C <worktree> status --short --branch
git -C <worktree> diff --stat
git -C <worktree> log --oneline --decorate -5
```

Repair options:

```bash
# HITL/approval-cop required: remove an untrusted worktree after evidence and backup are captured.
approval-cop run -- git -C <repo> worktree remove --force <worktree>

# HITL/approval-cop required: prune stale administrative records after confirming they point only to missing worktrees.
approval-cop run -- git -C <repo> worktree prune --verbose

# HITL/approval-cop required: discard uncommitted changes in a trusted worktree only after diff evidence is reviewed.
approval-cop run -- git -C <worktree> reset --hard <expected-head>

# Non-destructive replacement after cleanup approval has completed.
# Use this when the issue branch already exists.
git -C <repo> worktree add <worktree> <branch>

# Use this only when the recovery branch must be created from origin/main.
git -C <repo> worktree add -b <branch> <worktree> origin/main
```

Verification:

```bash
git -C <worktree> status --short --branch
git -C <worktree> rev-parse HEAD
git -C <repo> worktree list --porcelain
```

Expected healthy verification:

```text
## resolve/issue-1684-docs-dr-add-incident-runbook-for-corrupted-workt...origin/main
```

### B. Queue repair or retirement

Use when approval-cop or dead-letter entries are stale, malformed, already executed, or unsafe to replay.

Read-only precheck:

```bash
approval-cop pending --json
approval-cop status --json
frankenbeast dr dead-letter-inspect <queue-file> <entry-id>
frankenbeast dr dead-letter-replay-dry-run <queue-file> <entry-id>
```

Repair options:

```bash
# HITL/approval-cop required: retire a stale approval token or queue item after backup and exact evidence review.
approval-cop run -- approval-cop retire <token-or-entry-id> --reason "stale after incident <id>"

# HITL/approval-cop required: retire or quarantine a dead-letter entry after dry-run output proves no supported replay executor is available, or after separate manual handling is proven.
approval-cop run -- frankenbeast dr dead-letter-retire <queue-file> <entry-id> "retired after dry-run classification in <incident-id>"
```

Do not reconstruct and run dead-letter side effects by hand. The current `dead-letter-replay-dry-run` command is evidence-only; it reports action class, target, replay safety, and the last error so operators can retire, quarantine, or wait for supported replay tooling instead of inventing a manual replay command during an incident.

Verification:

```bash
approval-cop pending --json
frankenbeast dr dead-letter-list <queue-file>
```

Expected healthy verification:

```text
No pending approval tokens older than the incident start.
No replayable dead-letter entry remains without owner, classification, and next action.
```

### C. Worker defer, replace, or unblock

Use when Kanban/liveness disagrees with live worker processes, or duplicate cards own the same issue/PR.

Read-only precheck:

```bash
hermes kanban show <task-id> --json
pgrep -af '<worker-or-dispatcher-pattern>'
gh pr list --repo <owner/repo> --state open --json number,headRefName,headRefOid,url
```

Repair options:

```bash
# HITL/approval-cop required: kill only a confirmed duplicate or runaway process after owner evidence is recorded.
approval-cop run -- kill <pid>

# HITL/approval-cop required: block a duplicate card so it cannot respawn over the active owner.
approval-cop run -- hermes kanban block <duplicate-task-id> "duplicate-owner: <active-task-or-pr> owns this issue"

# HITL/approval-cop required: unblock a card only when the incident commander records the blocker as stale and names the next action.
approval-cop run -- hermes kanban unblock <task-id> --comment "stale blocker cleared in <incident-id>; resume from <evidence>"

# HITL/approval-cop required: complete a stale card only after live PR/issue/check/thread state proves terminal completion.
approval-cop run -- hermes kanban complete <task-id> --summary "terminal state verified in <incident-id>"
```

Verification:

```bash
hermes kanban show <task-id> --json
hermes kanban list --status running --json
pgrep -af '<worker-or-dispatcher-pattern>'
```

Expected healthy verification:

```text
One active owner remains for the issue/PR, or the card has one explicit blocker with the exact next decision.
No duplicate running worker or monitor targets the same branch/PR/card set.
```

### D. Restore-preview state repair

Use when Kanban, approval, cron, memory, or liveness records must be compared against a backup. Keep the comparison read-only until every drift row is classified.

Read-only precheck:

```bash
frankenbeast dr restore-dry-run <backup-manifest.json> <live-manifest.json> | tee "$EVIDENCE_DIR/restore-dry-run.json"
```

Repair options:

```bash
# HITL/approval-cop required: restore, merge, skip, or quarantine each drift item only after restore-preview evidence is reviewed.
approval-cop run -- <exact-restore-or-quarantine-command>
```

Verification:

```bash
frankenbeast dr restore-dry-run <backup-manifest.json> <live-manifest.json>
```

Expected healthy verification:

```text
destructiveActions.enabled remains false until the approved repair is complete.
Remaining drift is either resolved or has an explicit restore/merge/skip/quarantine decision.
```

## 5. Final verification checklist

Before resuming automation, the incident commander and scribe must verify:

- [ ] Worktree list has no prunable/missing entries for the repaired scope.
- [ ] The active worktree is on the expected branch and clean except for the intended issue diff.
- [ ] Kanban has at most one active owner for each issue/PR/card.
- [ ] Every duplicate/stale card is blocked, completed, or assigned one explicit next decision.
- [ ] Approval-cop pending entries are current, exact, and bound to the reviewed command text.
- [ ] Dead-letter queue entries are retired, explicitly owned, or still dry-run only.
- [ ] PR state, issue state, CI, Codex, and unresolved review-thread evidence agree before any merge.
- [ ] Backup artifacts have digests, owners, data classes, and retention deadlines.
- [ ] The incident log includes commands run, outputs, approvers, and links to evidence.

## 6. Handoff template

Paste this into the incident issue, Kanban card, or PR comment after repair:

```text
Incident: <id>
Scope: <repo/env/card/pr/queue>
Commander: <name>
Scribe: <name>

Diagnosis:
- Worktree state: <healthy/corrupt evidence path>
- Kanban/liveness state: <healthy/corrupt evidence path>
- Queue state: <healthy/corrupt evidence path>
- PR/issue state: <evidence path or URL>

Backups:
- <artifact>: <path>, sha256=<digest>, data-class=<class>, retention=<date>, owner=<owner>

Repairs:
- <command or action>, approval=<approval-cop token/link>, result=<output path>

Verification:
- Worktree: <command/result>
- Kanban/liveness: <command/result>
- Queue: <command/result>
- PR/CI/Codex: <command/result>

Remaining blocker or next action:
- <none, or one exact owner + decision>
```

## Related references

- [Incident command checklist](incident-command-checklist.md)
- [Restore preview and approval-ledger recovery reports](restore-preview.md)
- [Backup ownership and retention policy](backup-ownership-retention-policy.md)
- [Runtime config rollback plan](runtime-config-rollback-plan.md)
- [Worker push rollback runbook](../runbooks/worker-push-rollback.md)
- [Approval anomaly detection](../../packages/franken-governor/docs/approval-anomaly-detection.md)
- [Agent tool execution threat model](../agent-tool-execution-threat-model.md)
