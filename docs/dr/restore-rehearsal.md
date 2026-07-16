# Restore rehearsal fixture

The restore rehearsal is an isolated disaster-recovery smoke test for the orchestration state that PM-swarm and approval-gated workers depend on.

Run it locally with:

```bash
npm run dr:restore-rehearsal
```

CI runs the same command through `npm run ci:dr:restore-rehearsal` after the bootstrap dry-run and before later audit gates.

## What the rehearsal creates

The script builds synthetic state under a temporary root only; it never reads or writes a live Hermes profile, live Kanban database, approval ledger, or user config. The fixture contains the minimal recoverable orchestration data that has caused restore risk in prior incidents:

- `profiles/default/kanban.db` with one task and one task comment.
- `profiles/default/approvals/ledger.json` with one approved approval entry.
- `profiles/default/config.yaml` with liveness values, including `kanban.dispatch_stale_timeout_seconds`, `liveness.heartbeat_interval_seconds`, and `liveness.worker_ids`.
- A backup manifest recording that the fixture was captured by `scripts/restore-rehearsal.mjs`.

## What the rehearsal proves

The rehearsal copies the fixture into a backup directory, restores that backup into a separate temporary target, and asserts that the task, comment, approval entry, and liveness values survived. It also runs a corrupted-fixture case by breaking the approval ledger JSON and requiring the restore assertion to fail with a clear `approval ledger is not valid JSON` error.

Use `node scripts/restore-rehearsal.mjs --format json` when automation needs machine-readable evidence. Use `--keep-temp --root <scratch-dir>` only for debugging the fixture contents; never point `--root` at a repository root, home directory, or live profile.
