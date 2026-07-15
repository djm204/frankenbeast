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

## Kanban card resurrection guardrails

Backup-only task records are treated as `blocker` conflicts. A backup-only task means the backup manifest contains a Kanban card that live state no longer has, so blindly restoring it could resurrect deleted, completed, reassigned, or otherwise intentionally removed work.

Expected interpretation:

- `area`: `tasks`
- `type`: `backup-only`
- `severity`: `blocker`
- recovery guidance: do not automatically resurrect the card; confirm why the live card is absent, then explicitly recreate a new card or skip that backup record.

This guardrail keeps restore-preview output consumable by PM/liveness tooling: backup-only cards require an explicit operator decision instead of being presented as safe informational drift.

## Tabletop exercises

Use `docs/dr/tabletop-exercise-template.md` when operators need to rehearse a restore-preview scenario before executing any recovery work. The template keeps disaster-recovery practice read-only, requires at least one fail-closed edge case such as corrupt backup input, and records explicit restore/merge/skip/quarantine decisions for every drift item.
