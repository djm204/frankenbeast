# Project-scoped memory snapshots

Project memory snapshots are compact, auditable memory bundles that PMs can attach to one-issue worker handoffs when normal profile-wide memory would leak unrelated preferences, conventions, or personal facts into a task.

Use a snapshot when:

- a worker is launched for a specific repository or issue family;
- the task needs durable project conventions or lessons from prior workers;
- unrelated user/profile memories would be distracting or sensitive;
- the PM needs the handoff to be reproducible from source records.

Do not use a snapshot as a replacement for live issue/PR inspection. Workers must still verify GitHub, CI, and repository state before acting.

## Snapshot selector

Build snapshots with `buildProjectMemorySnapshot()` from `@franken/orchestrator`. The selector should be as narrow as practical:

```ts
import { buildProjectMemorySnapshot } from '@franken/orchestrator';

const snapshot = buildProjectMemorySnapshot({
  selector: {
    projectId: 'frankenbeast',
    repo: 'djm204/frankenbeast',
    taskType: 'memory',
    role: 'worker',
    minConfidence: 0.7,
    allowedSensitivity: ['public', 'internal'],
  },
  memories,
});
```

Filtering dimensions:

- `projectId`: required project scope.
- `repo`: optional repository scope, for example `djm204/frankenbeast`.
- `taskType`: optional task family such as `memory`, `web`, `security`, or `docs`.
- `role`: optional handoff audience such as `worker`, `pm`, or `reviewer`.
- `minConfidence`: excludes low-confidence recollections.
- `allowedSensitivity`: defaults to `public` and `internal`; sensitive and secret records must be explicitly opted in.

## Auditing and regeneration

Every included entry carries compact provenance metadata:

- `source`: source document/system that produced the memory;
- `evidenceId`: optional issue/comment/run identifier;
- `observedAt`: original observation time;
- `ageDays`: computed age at snapshot generation;
- `confidence` and `sensitivity`.

The rendered `snapshot.text` is suitable for attaching to a PM handoff. Keep the structured `snapshot.entries` when a machine-readable audit trail is needed.

## PM guidance

PMs should attach snapshots immediately after the task brief and before worker-specific instructions. Prefer fewer high-confidence entries over large dumps. If a required convention is missing from the snapshot, update the source memory/lesson record and regenerate the snapshot instead of hand-editing the rendered text.
