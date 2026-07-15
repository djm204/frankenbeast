# Restore preview disaster-recovery fixtures

Restore preview is a read-only comparison between a backup manifest and the current live manifest. It is intended to make disaster-recovery drift explicit before an operator restores any state.

## Missing cron job recovery

The fixture at `packages/franken-orchestrator/tests/unit/dr/fixtures/missing-cron-job-recovery.json` captures a backup manifest that contains the `nightly-dr-check` cron job while the live manifest has no matching cron entry.

Expected interpretation:

- `area`: `cron`
- `type`: `backup-only`
- `severity`: `info`
- recovery guidance: review the cron drift and explicitly restore, merge, or skip the job; do not silently drop it and do not overwrite live schedules blindly.

This fixture is covered by `packages/franken-orchestrator/tests/unit/dr/restore-preview.test.ts` so future restore-preview changes keep missing cron jobs visible in deterministic test output.

## Backup encryption verification report

`buildBackupEncryptionVerificationReport(manifest, options)` produces a deterministic, structured report that operators and PM/liveness tooling can inspect before trusting a disaster-recovery backup artifact. The report is read-only and includes:

- `status`: `verified`, `warning`, or `failed`
- `encrypted`: whether the manifest explicitly reports encryption is enabled
- `metadata`: the manifest's encryption metadata when present
- `findings`: blocker/warning records with actionable recommendations
- `operatorSummary`: a concise human-readable interpretation

A backup manifest should include:

```json
{
  "schemaVersion": 1,
  "encryption": {
    "encrypted": true,
    "algorithm": "aes-256-gcm",
    "keyRef": "dr/backups/prod-primary",
    "artifactDigest": "sha256:...",
    "generatedAt": "2026-07-14T12:00:00.000Z"
  }
}
```

Interpretation guidance:

- `failed`: do not restore blindly. Encryption metadata is missing, encryption is disabled, the cipher suite is absent, or runtime-loaded metadata is malformed.
- `warning`: encryption is present, but the report lacks restore-critical evidence such as an allowed algorithm, logical key reference, or encrypted artifact digest. Require operator review before restore.
- `verified`: encryption is present, uses an allowed algorithm, and includes key/digest evidence for disaster-recovery handoff.

Tests cover verified metadata, missing metadata, malformed runtime-loaded metadata, unsupported algorithms, and missing restore-critical references so future DR changes keep the report machine-readable and actionable.

## Kanban card resurrection guardrails

Backup-only task records are treated as `blocker` conflicts. A backup-only task means the backup manifest contains a Kanban card that live state no longer has, so blindly restoring it could resurrect deleted, completed, reassigned, or otherwise intentionally removed work.

Expected interpretation:

- `area`: `tasks`
- `type`: `backup-only`
- `severity`: `blocker`
- recovery guidance: do not automatically resurrect the card; confirm why the live card is absent, then explicitly recreate a new card or skip that backup record.

This guardrail keeps restore-preview output consumable by PM/liveness tooling: backup-only cards require an explicit operator decision instead of being presented as safe informational drift.

## Recovery mode

Call `detectRestorePreviewConflicts(backup, live, { recoveryMode: true })` when an operator or autonomous worker is inspecting a damaged, partial, or otherwise uncertain live state. Recovery mode is still read-only (`wouldWrite: false`), and it adds a structured destructive-action policy to the preview:

```json
{
  "mode": "recovery",
  "destructiveActions": {
    "enabled": false,
    "blocked": [
      { "area": "tasks", "id": "task-1", "type": "overwrite-live-record" },
      { "area": "tasks", "id": "task-2", "type": "delete-live-record" },
      { "area": "approvals", "id": "approval-1", "type": "restore-approval-token" }
    ]
  }
}
```

Operators should treat `destructiveActions.enabled: false` as a hard stop for restore executors: do not overwrite live records, delete live-only records, run schema migrations, or restore approval tokens while recovery mode is active. Backup-only task, memory, and cron records are intentionally not listed as destructive because restoring missing non-approval state is additive; backup-only approval tokens remain blocked because they re-authorize sensitive workflow state. Use the conflict list to preserve/merge non-destructive state first, then exit recovery mode only after a human explicitly approves the destructive restore plan.

## Tabletop exercises

Use `docs/dr/tabletop-exercise-template.md` when operators need to rehearse a restore-preview scenario before executing any recovery work. The template keeps disaster-recovery practice read-only, requires at least one fail-closed edge case such as corrupt backup input, and records explicit restore/merge/skip/quarantine decisions for every drift item.
