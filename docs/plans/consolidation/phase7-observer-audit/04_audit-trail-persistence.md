# Chunk 7.4: Audit Trail Persistence

**Phase:** 7 — Observer Audit Trail
**Depends on:** Chunk 7.1 (audit schema), Chunk 7.2 (execution replay)
**Estimated size:** Medium (~120 lines + tests)

---

## Purpose

Phase 7 promises self-contained, replayable audit logs that live with the project. The existing chunks define the event schema and replay behavior, but not where the audit trail is persisted or how it is loaded back from project storage.

This chunk makes the artifact concrete.

## Design

### Artifact Location

Store one file per run under:

```text
.frankenbeast/audit/<runId>.json
```

This keeps audit data local to the repository without mixing it into source files.

### Artifact Shape

```typescript
interface PersistedAuditTrail {
  version: 1;
  runId: string;
  createdAt: string;
  events: AuditEvent[];
}
```

v1 uses a single JSON file per run instead of JSONL. That keeps replay and manual inspection simple.

### Write Timing

- create the audit directory lazily
- write once at run finalization
- optionally overwrite the same run file on repeated flushes if an intermediate save is needed later

The minimum requirement for this chunk is final write on closure so the artifact survives process exit.

## Implementation

### 1. Add an `AuditTrailStore`

```typescript
// packages/franken-observer/src/audit-trail-store.ts

import fs from 'node:fs';
import path from 'node:path';
import type { AuditTrail } from './audit-event.js';

export class AuditTrailStore {
  constructor(private readonly projectRoot: string) {}

  save(runId: string, trail: AuditTrail): string {
    const dir = path.join(this.projectRoot, '.frankenbeast', 'audit');
    fs.mkdirSync(dir, { recursive: true });

    const file = path.join(dir, `${runId}.json`);
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      runId,
      createdAt: new Date().toISOString(),
      events: trail.toJSON(),
    }, null, 2));

    return file;
  }

  load(runId: string): AuditTrail {
    const file = path.join(this.projectRoot, '.frankenbeast', 'audit', `${runId}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return AuditTrail.fromJSON(raw.events);
  }
}
```

### 2. Export from `franken-observer`

Export `AuditTrailStore` from the package index.

### 3. Wire final persistence in orchestrator closure

In `beast-loop.ts` or the closure/finalization path:

- if `deps.auditTrail` exists, save it with the current `runId`
- log the resulting artifact path
- do not fail the run if audit persistence itself fails; log the error clearly

### 4. Keep replay compatible

`ExecutionReplayer` should accept an `AuditTrail` loaded from `AuditTrailStore.load(runId)`.

## Tests

```typescript
describe('AuditTrailStore', () => {
  it('writes .frankenbeast/audit/<runId>.json', () => { ... });
  it('creates the audit directory when missing', () => { ... });
  it('loads a persisted trail back into AuditTrail', () => { ... });
  it('round-trips persisted events without loss', () => { ... });
});

describe('audit persistence integration', () => {
  it('persists the audit artifact during run finalization', async () => { ... });
  it('replayer can load and replay a persisted artifact', () => { ... });
  it('logs but does not fail the run when audit persistence throws', async () => { ... });
});
```

## Files

- **Add:** `packages/franken-observer/src/audit-trail-store.ts`
- **Modify:** `packages/franken-observer/src/index.ts`
- **Modify:** `packages/franken-orchestrator/src/beast-loop.ts` or closure/finalization path
- **Add:** `packages/franken-observer/tests/unit/audit-trail-store.test.ts`
- **Modify/Add:** integration test covering persisted replay artifact

## Exit Criteria

- Each completed run persists a replayable audit artifact under `.frankenbeast/audit/`
- Persisted artifact includes schema version, run ID, timestamp, and ordered events
- Persisted artifact loads cleanly into `AuditTrail.fromJSON()`
- `ExecutionReplayer` works with a trail loaded from disk
- Audit persistence errors are visible but do not crash the run
