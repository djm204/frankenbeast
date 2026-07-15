# Checkpoint lock recovery

Frankenbeast checkpoint stores create `<checkpoint>.lock` files while writing recovery state. A lock file should normally disappear as soon as the write finishes. If an agent, worker, or host crashes mid-write, later checkpoint writes may report a lock timeout.

## Read-only stale-lock detector

Use `detectCheckpointLock(checkpointPath)` from `@franken/orchestrator` before deleting a lock by hand. The detector mirrors the runtime reaping rules and never mutates the filesystem.

Example:

```ts
import { detectCheckpointLock } from '@franken/orchestrator';

const diagnostic = detectCheckpointLock('/path/to/.fbeast/.build/my-plan.checkpoint');
console.log(diagnostic.status, diagnostic.reason, diagnostic.unlockHint);
```

The structured result includes:

- `status: 'absent' | 'held' | 'stale'`
- `safeToRemove: boolean`
- `ownerPid` and `ownerAlive` when the lock has a parseable owner record
- `reason`, suitable for logs or PM/liveness reports
- `unlockHint`, a conservative human-readable instruction

## Safe unlock policy

Only remove a lock manually when `safeToRemove` is `true`. The hint names the exact lock file to remove with a shell-quoted `rm -- '<checkpoint>.lock'` command, but operators must first quiesce checkpoint writers and re-run the detector so a newly acquired live lock is not removed.

Do not remove a lock when the detector reports `status: 'held'` and `safeToRemove: false`. Inspect the owner process first, for example:

```bash
ps -p <ownerPid> -o pid,ppid,etime,command
```

Malformed or truncated owner records are treated as a crash window at first, not immediately stale. Re-run the detector after the grace window; old malformed locks become safe to remove with an explicit hint.

## Runtime behavior

`FileCheckpointStore` already reaps stale locks during normal writes when the owner is dead, the PID has been reused, or an unreadable owner record exceeds the crash-recovery grace window. The detector exists for liveness and operator tooling that need a read-only diagnosis before choosing a manual unlock.
