# Disaster tabletop exercise template

Use this template to run a deterministic disaster-recovery tabletop before changing restore tooling, rotating critical operators, or exercising backup/restore confidence. The exercise is deliberately non-destructive: operators inspect manifests, compare live state, and record decisions without restoring or overwriting production data.

## Exercise metadata

| Field | Value |
| --- | --- |
| Exercise name | `<short incident name>` |
| Date / window | `<YYYY-MM-DD HH:MM UTC>` |
| Facilitator | `<name>` |
| Participants | `<operator, PM, worker owner, approver>` |
| Systems in scope | `<cron jobs, worker queues, approvals, state manifests>` |
| Systems out of scope | `<anything that must not be touched>` |
| Backup manifest | `<path, URI, or snapshot id>` |
| Live manifest | `<path, URI, or environment>` |
| Communication channel | `<incident room / kanban card / ticket>` |

## Preconditions

- Confirm the exercise runs in dry-run/read-only mode and no restore command will be executed.
- Capture the current live manifest reference and the backup manifest reference before discussion starts.
- Assign one scribe to record every decision, unknown, and follow-up owner.
- Define a stop condition: any participant can halt the exercise if a step would mutate production, expose secrets, or require credentials outside the approved scope.

## Scenario prompt

> A critical operator reports that a restore may be required because live orchestration state is incomplete, stale, or partially corrupt. The team must decide whether to restore, merge, quarantine, or skip each drifted item while preserving evidence and avoiding silent destructive changes.

## Injects

Run at least one success-path inject and one negative/edge inject. Add issue-specific injects when exercising a new restore fixture.

| Inject | Expected operator action | Evidence to capture |
| --- | --- | --- |
| Backup-only cron job | Identify the missing scheduled job and choose restore, merge, or skip explicitly. | Restore-preview output showing `area: cron`, `type: backup-only`, severity, and final decision. |
| Live-only approval/session token | Preserve live approval state and skip token restore; require a fresh approval if the backup lacks the live token. | Decision log naming the approver or owner, token class, and why restore was skipped or re-approval was required. |
| Corrupt backup manifest | Stop before restore, quarantine or replace the corrupt artifact, and record the failed validation path. | Validation error, quarantined artifact path or replacement source, and owner for backup repair. |
| Partial worker state | Compare task id, branch, PR, and latest heartbeat before overwriting or merging worker state. | Current worker evidence plus the chosen recovery action. |

## Facilitation steps

1. Read the scenario aloud and confirm the exercise scope.
2. Open the backup manifest and live manifest in read-only mode.
3. Generate or inspect restore-preview output for each drifted item.
4. For every item, classify the action as `restore`, `merge`, `skip`, or `quarantine`.
5. For every `restore` or `merge` decision, name the approver and the exact approval artifact before any follow-up implementation work starts.
6. For every `skip` or `quarantine` decision, record the reason and the owner for cleanup.
7. End the exercise by reviewing unresolved blockers and turning each into a tracked follow-up.

## Decision log

| Time (UTC) | Drift item | Action | Approver / owner | Evidence link | Notes |
| --- | --- | --- | --- | --- | --- |
| `<HH:MM>` | `<manifest key>` | `restore \| merge \| skip \| quarantine` | `<name>` | `<link/path>` | `<why>` |

## Edge-case checklist

- [ ] The team demonstrated that corrupt or unreadable backup input fails closed.
- [ ] Backup-only credentials, approvals, and session tokens were treated as blocker-risk, not informational drift.
- [ ] Live-only state was not deleted solely because it was absent from backup.
- [ ] Cron or scheduled work changes were reviewed for timezone, cadence, and owner before restore.
- [ ] Every decision has an owner and evidence reference.
- [ ] No production restore, force-push, branch deletion, or secret export occurred during the tabletop.

## After-action summary

Complete this section before closing the tabletop card.

- What failed or surprised the team?
- Which restore-preview output was ambiguous?
- Which runbook, fixture, or alert should change before the next exercise?
- Which follow-up tickets were created, and who owns them?

## Pass/fail criteria

The tabletop passes only when the team can explain every drift item, demonstrate at least one fail-closed edge case, and leave behind enough evidence for a later worker to reproduce the reasoning. If any step requires undocumented tribal knowledge or an untracked manual command, the exercise fails until that gap is documented or ticketed.
