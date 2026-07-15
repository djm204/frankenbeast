# State write transaction journal

Frankenbeast state files that use `atomicWriteFileSync()` are protected by a sidecar transaction journal at `<state-file>.journal` while a write is in flight.

## Normal write path

1. The writer records a journal with the target path, temporary file path, phase, and timestamps.
2. The writer writes the replacement state to `<state-file>.tmp.*`, fsyncs it, and renames it over the target.
3. The writer removes `<state-file>.journal` and fsyncs the parent directory.

A successful write leaves only the final state file. Operators should not see `.tmp.*` or `.journal` files during steady state.

## Recovery behavior

Before the next atomic state write, Frankenbeast calls `recoverStateWriteTransaction()` for the target path. Recovery is deterministic:

- If the journal names a leftover temp file, the temp file is removed and the target remains the last complete state file, or the already-renamed replacement if the crash happened after rename.
- If the journal is left behind but the temp file is gone, the journal is removed as a completed write marker.
- If the journal JSON is malformed or unsupported, the journal is quarantined with a `.corrupt.*` suffix instead of being trusted.

## Operator guidance

A lingering `<state-file>.journal` means the process stopped during an atomic write. Restarting the component or performing another write to the same state file will clean the journaled temp file. If the journal is quarantined, inspect the `.corrupt.*` file before deleting it; malformed journals indicate a disk/process interruption while recording recovery metadata.
