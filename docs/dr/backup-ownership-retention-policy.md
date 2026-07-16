# Backup ownership and retention policy

This policy defines who owns Frankenbeast disaster-recovery backups, what each backup contains, where it may live, how long it may be retained, and how operators prove restore readiness without preserving sensitive state indefinitely.

## Ownership and escalation

| Responsibility                                      | Primary owner             | Backup owner              | Emergency escalation                                          |
| --------------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------- |
| Backup job health, manifests, and storage lifecycle | DR operator on call       | Platform lead             | Incident commander in `docs/dr/incident-command-checklist.md` |
| Encryption keys and restore authorization           | Security operator on call | Security lead             | Incident commander plus security lead approval                |
| Restore tabletop evidence and retention exceptions  | Reliability owner         | Platform lead             | Incident commander plus reliability owner approval            |
| Deletion requests for expired or sensitive backups  | DR operator on call       | Security operator on call | Security lead if deletion cannot complete within the SLA      |

Emergency contact guidance:

1. Open the active incident channel or Kanban card and assign one incident commander and one scribe before touching backup artifacts.
2. Page the DR operator on call for backup job or manifest failures.
3. Page the security operator on call for encryption-key, credential, approval-token, or deletion exceptions.
4. If either owner is unavailable for 30 minutes during an active incident, escalate to the platform lead and security lead together.
5. Record every restore, skip, merge, quarantine, or deletion decision in the incident log.

## Backup inventory

| Backup type                                                       | Owner                     | Allowed location                                                                     | Retention window                                 | Encryption expectation                                                                                                            | Restore test cadence                                                                     | Deletion process                                                                                                               |
| ----------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Point-in-time DR manifest                                         | DR operator on call       | Private DR bucket or encrypted operator vault under `dr/manifests/<env>/`            | 35 days for production, 14 days for staging/dev  | Manifest must include encryption metadata, key reference, artifact digest, capture time, and generated time                       | Monthly read-only restore-preview tabletop and after every restore-tooling change        | Delete after retention expiry; record manifest digest and deletion timestamp in the incident/audit log                         |
| Runtime state bundle (`kanban`, approvals, liveness, runs, other) | DR operator on call       | Private DR bucket or encrypted operator vault under `dr/state/<env>/`                | 7 days maximum for production and staging/dev    | Required at rest with an approved AEAD algorithm such as `aes-256-gcm`; raw bundle must never be shared in chat or issue comments | Monthly restore-preview comparison using a non-production target or dry-run manifest     | Delete raw bundle after retention expiry or immediately after verified restore if it contains live credentials/approval tokens |
| Approval ledger snapshot                                          | Security operator on call | Encrypted operator vault only; attach redacted reports, not raw ledgers, to tickets  | 7 days production, 72 hours staging/dev          | Required; token material must be digested/redacted in reports                                                                     | Monthly approval-ledger recovery report tabletop and before any approval replay decision | Delete or quarantine any backup-only approval token; require fresh human approval instead of replaying stale tokens            |
| Memory and prompt/session artifacts                               | Security operator on call | Encrypted operator vault under tenant-scoped prefixes                                | 7 days production, 72 hours staging/dev          | Required; classify as `user-private` or `secret` depending on contents                                                            | Quarterly privacy review plus restore-preview sampling during tabletop                   | Delete on retention expiry or privacy request; preserve only redacted audit evidence                                           |
| Cron/scheduled-work snapshot                                      | Reliability owner         | Private DR bucket or encrypted operator vault under `dr/schedules/<env>/`            | 35 days production, 14 days staging/dev          | Required when bundled with runtime state; standalone redacted schedule inventory may be `sensitive`                               | Monthly restore-preview comparison for missing or backup-only jobs                       | Delete expired snapshots after confirming no open incident references them                                                     |
| Restore verification reports                                      | Reliability owner         | Incident ticket, private DR bucket, or repository-private audit folder when redacted | 180 days, unless incident policy requires longer | Redacted reports may be `sensitive`; never embed raw secret/user-private fields                                                   | Generated for every tabletop and every real restore decision                             | Delete with incident record retention; remove any accidentally embedded secrets immediately                                    |

## Sensitive data retention limits

| Data class     | Examples                                                                                 | Maximum retention                                                                        | Handling rule                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secret`       | credentials, raw backups, approval tokens, encryption key references with access context | 7 days unless encrypted state-bundle policy grants a shorter incident-specific exception | Store only in approved encrypted locations; never paste into GitHub, Discord, or Kanban comments. Delete immediately after restore if not needed for audit. |
| `user-private` | prompts, memory, tenant/user content, session transcripts                                | 7 days production, 72 hours staging/dev                                                  | Keep tenant-scoped; redact before sharing or attaching to incident evidence.                                                                                |
| `sensitive`    | logs, traces, post-mortems, webhook payload metadata, restore reports                    | 35 days for operational evidence; 180 days for redacted incident records                 | Redact secrets and user-private fields before ticketing or long-term retention.                                                                             |
| `internal`     | backup job metadata without tenant/private content                                       | 90 days                                                                                  | Keep inside operator/project boundary.                                                                                                                      |
| `public`       | published docs and examples with no runtime data                                         | Indefinite                                                                               | Must not include live backup identifiers, key refs, credentials, or tenant data.                                                                            |

The canonical classification reference is `docs/runtime-artifact-data-classification.md`. When a backup mixes classes, use the highest-sensitivity class for storage, sharing, and deletion decisions.

## Verification and restore command references

Use read-only verification before any restore or deletion decision:

- `docs/dr/restore-preview.md` describes restore-preview output, backup encryption verification reports, approval-ledger recovery reports, point-in-time manifests, consistency checks, partial-write recovery, and backup-only task/card guardrails.
- `docs/dr/tabletop-exercise-template.md` provides the monthly non-destructive tabletop format.
- `docs/dr/incident-command-checklist.md` defines incident command, evidence capture, and escalation during DR events.
- `npm run dr:runtime-config-rollback:dry-run -- --before <before.json> --after <after.json> --target <target.json>` previews runtime-config rollback decisions without writing live state.
- `npm run dr:worker-push-rollback:dry-run -- --branch <branch> --remote <remote> --last-good <sha>` previews worker branch rollback decisions without pushing.

Closed implementation references for backup tooling:

- [#1835](https://github.com/djm204/frankenbeast/issues/1835) tracks the memory-store backup verification command.
- [#1839](https://github.com/djm204/frankenbeast/issues/1839) tracks the backup encryption verification report.

## Deletion workflow

1. Identify the backup artifact, manifest digest, environment, tenant prefix, data classes, and retention deadline.
2. Confirm there is no active incident, restore tabletop, legal/security hold, or open DR issue requiring the artifact.
3. For `secret` or `user-private` artifacts, get security-operator approval before deleting or extending retention.
4. Delete the artifact from the allowed storage location and remove derived raw copies from local operator workstations.
5. Record only safe evidence: artifact type, digest, owner, deletion timestamp, retention reason, and approver. Do not record raw backup contents.
6. If deletion fails, quarantine access to the artifact, page the security operator, and escalate after 30 minutes.

## Audit checklist

Security and reliability reviewers can audit compliance by checking that each backup has:

- an owner and backup owner;
- an allowed storage location;
- a retention deadline mapped to the highest data class it contains;
- encryption metadata and artifact digest evidence when the artifact contains secret, user-private, or sensitive data;
- a restore-preview or tabletop record within the required cadence;
- a deletion record after the retention deadline; and
- incident-command evidence for any emergency restore, retention extension, quarantine, or deletion failure.
