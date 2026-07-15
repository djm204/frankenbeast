# Incident command checklist for automation failures

Use this checklist when automation that normally coordinates workers, PR gates, approvals, backups, restores, or liveness monitoring fails or starts producing ambiguous handoffs. The goal is to put one person in incident command, freeze unsafe automation paths, preserve evidence, and route every recovery action through an explicit decision trail.

This checklist is operator guidance, not a restore script. Do not run destructive commands from this document; copy the decision fields into the incident room, Kanban card, or ticket that is acting as the command log. It requires explicit decision-log rows before merges, force-pushes, restore commands, approval replays, or broad worker respawns.

## Incident metadata

| Field | Value |
| --- | --- |
| Incident id | `<ticket, Kanban card, or incident-room link>` |
| Start time (UTC) | `<YYYY-MM-DD HH:MM>` |
| Incident commander | `<single accountable operator>` |
| Scribe | `<person recording decisions>` |
| Affected automation | `<dispatcher, PM swarm, Codex gate, approval-cop, cron monitor, restore-preview, backup job>` |
| Communication channel | `<Discord thread, incident room, Kanban card, or issue>` |
| Current severity | `SEV-1 | SEV-2 | SEV-3 | SEV-4` |

## 1. Declare command and freeze unsafe paths

- [ ] Name exactly one incident commander and one scribe.
- [ ] Announce the command channel where all decisions must be recorded.
- [ ] Freeze automation that can mutate shared state until it is classified safe: merges, force-pushes, branch deletion, restore execution, approval replay, destructive cleanup, and broad worker respawns.
- [ ] Keep read-only monitors and inventory commands running when they are reliable enough to preserve evidence.
- [ ] Pin the scope: one failure class, one repository/environment, and the affected cards/PRs/jobs. Create a follow-up ticket for anything outside that scope.

## 2. Triage the failure class

Classify the first confirmed symptom before assigning recovery work.

| Failure class | Immediate command decision | Required evidence |
| --- | --- | --- |
| Worker or dispatcher crash loop | Stop respawn churn; verify live PIDs, current Kanban state, and whether any PR already owns the issue. | Kanban task id, latest run id, PID/heartbeat evidence, worktree path, linked PR if present. |
| Codex review gate stalled or usage-limited | Do not merge on silence or usage-limit text. Poll the latest trigger, count invocations, and park on explicit human approval when the cap is exhausted. | PR number, head SHA, latest trigger timestamp, bot comments/reviews, unresolved review-thread count. |
| Approval pipeline failed or replayed stale tokens | Freeze destructive commands and require a fresh approval decision. | Approval ledger/session id, command text, token age, approver, and whether the command already executed. |
| Backup or restore-preview ambiguity | Keep the restore path read-only and classify every drift item before restore/merge/skip/quarantine. | Backup manifest, live manifest, restore-preview output, drift severity, operator decision. |
| Cron or monitor produced conflicting action | Pause duplicate monitors and choose one owner for the PR/card/job. | Cron job id, schedule, last output, target PR/card set, overlap evidence. |
| Corrupt or partial state artifact | Fail closed; quarantine the artifact and assign repair before any state mutation. | Artifact path/ref, validation error, quarantine location, replacement source or owner. |

## 3. Stabilize and inventory

Run only read-only commands during stabilization unless the incident commander records an explicit mutation approval.

- [ ] Capture live Kanban status for affected task ids and their parent/root cards.
- [ ] Capture live PR state: head SHA, merge state, status checks, review decision, and linked issue closure state.
- [ ] Capture current worktree state: branch, local head, remote head, dirty files, and ahead/behind status.
- [ ] Capture current automation owner: live worker PID, active cron job id, or PM/doctor card.
- [ ] Capture latest review/approval gate state: Codex trigger timestamp, unresolved thread count, usage-limit text, approval token status.
- [ ] If backup/restore is in scope, capture both manifests and restore-preview output before making decisions.

## 4. Assign roles and recovery lanes

Keep roles explicit so autonomous workers do not duplicate or overwrite each other.

| Role | Owner | Responsibility | Stop condition |
| --- | --- | --- | --- |
| Incident commander | `<name>` | Owns decisions, scope, and mutations. | Incident closed or handed off. |
| Evidence scribe | `<name>` | Records commands, outputs, links, and timestamps. | Evidence bundle attached to ticket/card. |
| Recovery implementer | `<worker/card>` | Makes the smallest approved fix in one branch/worktree. | PR merged, reverted, or blocked. |
| Gate operator | `<name or monitor>` | Watches CI/Codex/approval state and reports terminal status. | Green/current-head clean, explicit bypass approval, or blocker recorded. |
| Communications owner | `<name>` | Posts updates to users/PMs without adding unverified claims. | Stakeholders acknowledge status and next update time. |

## 5. Decision log template

Every mutation or route change must have a row before it happens.

| Time (UTC) | Decision | Owner | Evidence | Expiry / revisit |
| --- | --- | --- | --- | --- |
| `<HH:MM>` | `pause monitor | unblock card | trigger review | merge | bypass | quarantine artifact | restore item` | `<name/card>` | `<link/path/command output>` | `<time or condition>` |

## 6. Recovery action checklist

Use the matching lane only after stabilization is complete.

### Worker or Kanban failure

- [ ] If a live worker has a fresh heartbeat and matching scope, do not start a duplicate implementer.
- [ ] If the worker is stale or crashed, inspect the existing worktree before creating a new one.
- [ ] If a PR already closes the issue, drive that PR's gates instead of opening a duplicate branch.
- [ ] Record exact finish-line criteria: tests, CI, current-head Codex clean, merge, and card completion/blocker.

### Codex, CI, or approval gate failure

- [ ] Compare the PR head SHA to the head named by the latest clean review or status check.
- [ ] Treat usage-limit responses, silence, and stale-head clean comments as blockers until a fresh current-head clean, explicit bypass, or retry approval exists.
- [ ] Verify GraphQL review threads show zero unresolved Codex-authored threads before merge.
- [ ] If the review-trigger cap is exhausted, ask for exactly one decision: approve another trigger, wait for quota, or explicitly bypass/merge.

### Backup, restore, or state repair

- [ ] Keep restore commands disabled until all drift items are classified.
- [ ] For each item, choose `restore`, `merge`, `skip`, or `quarantine` and name an approver.
- [ ] Treat credentials, approvals, session tokens, and backup-only Kanban cards as blocker-risk unless a runbook says otherwise.
- [ ] Quarantine corrupt or unreadable artifacts before selecting a replacement source.

## 7. Escalation and communications

- [ ] Post a first update within 15 minutes: impact, affected automation, frozen paths, incident commander, and next update time.
- [ ] Escalate immediately if user data, secrets, production restores, branch rewrites, or repeated approval failures are involved.
- [ ] Use precise status language: say `working`, `blocked`, `usage-limited`, `stale-head clean`, or `needs explicit bypass`; do not say `clean` unless the current head has a clean gate.
- [ ] Convert every unresolved risk into a tracked follow-up before closing the incident.

## 8. Closure criteria

Close the automation-failure incident only when all of these are true:

- [ ] The affected automation path is either restored, safely disabled with an owner, or replaced by a documented manual process.
- [ ] No duplicate workers, monitors, or PRs remain active for the same scope.
- [ ] PR/issue/Kanban state is terminal or has one explicit blocker with the exact next decision.
- [ ] Evidence links are attached: commands run, outputs, PR/card links, review/approval state, and any restore-preview artifacts.
- [ ] Lessons or runbook updates were filed for anything that required tribal knowledge.

## Negative checks

Fail the incident review if any of these occurred without a recorded command decision:

- A merge, force-push, branch deletion, restore command, approval replay, or broad unblock was executed.
- A second worker or monitor was started while a live owner already existed for the same issue/PR/card.
- A stale Codex clean or usage-limit response was treated as a current-head clean gate.
- A corrupt, partial, or unclassified backup artifact was restored or merged into live state.
