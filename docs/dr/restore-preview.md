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

## Tabletop exercises

Use `docs/dr/tabletop-exercise-template.md` when operators need to rehearse a restore-preview scenario before executing any recovery work. The template keeps disaster-recovery practice read-only, requires at least one fail-closed edge case such as corrupt backup input, and records explicit restore/merge/skip/quarantine decisions for every drift item.
