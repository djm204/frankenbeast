# State write transaction journal

Frankenbeast state files that use `atomicWriteFileSync()` are protected by a sidecar transaction journal at `<state-file>.journal` while a write is in flight.

## Normal write path

1. The writer records a journal with the target path, temporary file path, phase, and wall-clock timestamps. Journal phase updates are written through a temporary journal file and renamed into place so a crash cannot truncate the last valid journal record. Long writes refresh the journal periodically before durability boundaries.
2. The writer writes the replacement state to `<state-file>.tmp.*`, fsyncs it, and renames it over the target.
3. The writer removes `<state-file>.journal` and fsyncs the parent directory.

A successful write leaves only the final state file. Operators should not see `.tmp.*` or `.journal` files during steady state.

## Recovery behavior

Before the next atomic state write, Frankenbeast calls `recoverStateWriteTransaction()` for the target path. Recovery is deterministic:

- If the journal names a leftover temp file and its wall-clock timestamp is stale, the temp file is removed and the target remains the last complete state file, or the already-renamed replacement if the crash happened after rename.
- If the journal names a temp file or preparing phase that still appears active, recovery leaves the journal and temp file in place so a concurrent writer is not disrupted.
- If the journal records a temp path outside the expected direct sibling `<state-file>.tmp.*` sidecar namespace, the journal is quarantined instead of unlinking the recorded path.
- If the journal is left behind but the temp file is gone, the journal is removed as a completed write marker.
- If the journal JSON is malformed or unsupported, the journal is quarantined with a `.corrupt.*` suffix instead of being trusted.

## Operator guidance

A lingering `<state-file>.journal` means the process stopped during an atomic write or another process is still writing the same state file. Restarting the component or performing another write to the same state file after the journal becomes stale will clean the journaled temp file. If the journal is quarantined, inspect the `.corrupt.*` file before deleting it; malformed or invalid journals indicate a disk/process interruption or unsafe recovery metadata.
