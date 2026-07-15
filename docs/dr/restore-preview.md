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

- `failed`: do not restore blindly. Encryption metadata is missing, encryption is disabled, or the cipher suite is absent.
- `warning`: encryption is present, but the report lacks restore-critical evidence such as an allowed algorithm, logical key reference, or encrypted artifact digest. Require operator review before restore.
- `verified`: encryption is present, uses an allowed algorithm, and includes key/digest evidence for disaster-recovery handoff.

Tests cover verified metadata, missing metadata, unsupported algorithms, and missing restore-critical references so future DR changes keep the report machine-readable and actionable.
