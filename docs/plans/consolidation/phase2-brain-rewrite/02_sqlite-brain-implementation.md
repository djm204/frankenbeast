# Chunk 2.2: SqliteBrain Implementation

**Phase:** 2 — Rewrite franken-brain
**Depends on:** Chunk 2.1 (brain interfaces in franken-types)
**Estimated size:** Medium (~200 lines implementation + ~200 lines tests)

---

## Purpose

Implement the core `SqliteBrain` class backed by SQLite via `better-sqlite3`. This is the single implementation of `IBrain` that handles all three memory types and provides `serialize()`/`hydrate()` for cross-provider handoff.

## Implementation

```typescript
// packages/franken-brain/src/sqlite-brain.ts
import Database from 'better-sqlite3';
import type {
  IBrain, IWorkingMemory, IEpisodicMemory, IRecoveryMemory,
  BrainSnapshot, EpisodicEvent, ExecutionState, EpisodicEventType,
} from '@frankenbeast/types';

export class SqliteBrain implements IBrain {
  readonly working: SqliteWorkingMemory;
  readonly episodic: SqliteEpisodicMemory;
  readonly recovery: SqliteRecoveryMemory;

  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.working = new SqliteWorkingMemory(this.db);
    this.episodic = new SqliteEpisodicMemory(this.db);
    this.recovery = new SqliteRecoveryMemory(this.db);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS working_memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS episodic_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        step TEXT,
        summary TEXT NOT NULL,
        details TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  serialize(): BrainSnapshot {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      working: this.working.snapshot(),
      episodic: this.episodic.recent(100),  // last 100 events
      checkpoint: this.recovery.lastCheckpoint(),
      metadata: {
        lastProvider: '',    // set by orchestrator before handoff
        switchReason: '',    // set by orchestrator before handoff
        totalTokensUsed: 0,  // set by orchestrator before handoff
      },
    };
  }

  static hydrate(snapshot: BrainSnapshot, dbPath: string = ':memory:'): SqliteBrain {
    const brain = new SqliteBrain(dbPath);
    brain.working.restore(snapshot.working);
    for (const event of snapshot.episodic) {
      brain.episodic.record(event);
    }
    if (snapshot.checkpoint) {
      brain.recovery.checkpoint(snapshot.checkpoint);
    }
    return brain;
  }

  close(): void {
    this.db.close();
  }
}
```

### WorkingMemory

- In-memory `Map<string, unknown>` as primary store
- `snapshot()` reads from the Map (fast)
- `restore()` replaces the Map contents
- On `checkpoint()` (triggered by recovery), flush Map to SQLite `working_memory` table
- `get()`/`set()`/`delete()`/`has()`/`keys()`/`clear()` operate on the Map

### EpisodicMemory

- All operations go directly to SQLite (no caching)
- `record()`: INSERT into `episodic_events`
- `recall()`: see Chunk 2.3 (episodic recall)
- `recentFailures()`: `SELECT ... WHERE type = 'failure' ORDER BY created_at DESC LIMIT ?`
- `recent()`: `SELECT ... ORDER BY created_at DESC LIMIT ?`
- `count()`: `SELECT COUNT(*) FROM episodic_events`

### RecoveryMemory

- `checkpoint()`: INSERT into `checkpoints` (append-only)
- `lastCheckpoint()`: `SELECT ... ORDER BY id DESC LIMIT 1`, parse JSON
- `clearCheckpoints()`: `DELETE FROM checkpoints`

## Tests

```typescript
// packages/franken-brain/tests/unit/sqlite-brain.test.ts

describe('SqliteBrain', () => {
  describe('working memory', () => {
    it('stores and retrieves values', () => { ... });
    it('snapshot() returns all key-value pairs', () => { ... });
    it('restore() replaces all state', () => { ... });
    it('clear() removes everything', () => { ... });
    it('has() and keys() reflect current state', () => { ... });
    it('handles complex objects (nested JSON)', () => { ... });
  });

  describe('episodic memory', () => {
    it('records events with auto-generated id', () => { ... });
    it('recent() returns most recent first', () => { ... });
    it('recentFailures() filters by type=failure', () => { ... });
    it('count() returns total events', () => { ... });
  });

  describe('recovery memory', () => {
    it('checkpoint() stores execution state', () => { ... });
    it('lastCheckpoint() returns most recent', () => { ... });
    it('lastCheckpoint() returns null when empty', () => { ... });
    it('clearCheckpoints() removes all', () => { ... });
    it('multiple checkpoints only returns latest', () => { ... });
  });

  describe('serialize/hydrate', () => {
    it('round-trips working memory', () => { ... });
    it('round-trips episodic events', () => { ... });
    it('round-trips checkpoint', () => { ... });
    it('round-trips with null checkpoint', () => { ... });
    it('hydrate creates independent brain instance', () => { ... });
    it('serialize → hydrate → serialize produces equivalent output', () => {
      // The "equivalent" check ignores timestamps that change between calls
    });
  });
});
```

### Integration test

```typescript
// packages/franken-brain/tests/integration/brain-serialize-hydrate.test.ts

describe('Brain serialize/hydrate integration', () => {
  it('full lifecycle: record events, checkpoint, serialize, hydrate, verify state', () => {
    const brain1 = new SqliteBrain();
    brain1.working.set('task', 'fix auth');
    brain1.working.set('progress', 0.5);
    brain1.episodic.record({
      type: 'failure',
      step: 'build',
      summary: 'Missing import in auth.ts',
      createdAt: new Date().toISOString(),
    });
    brain1.recovery.checkpoint({
      runId: 'run-1',
      phase: 'execution',
      step: 3,
      context: { files: ['auth.ts'] },
      timestamp: new Date().toISOString(),
    });

    const snapshot = brain1.serialize();
    const brain2 = SqliteBrain.hydrate(snapshot);

    expect(brain2.working.get('task')).toBe('fix auth');
    expect(brain2.working.get('progress')).toBe(0.5);
    expect(brain2.episodic.count()).toBe(1);
    expect(brain2.episodic.recentFailures(1)[0].summary).toContain('Missing import');
    expect(brain2.recovery.lastCheckpoint()?.phase).toBe('execution');

    brain1.close();
    brain2.close();
  });

  it('validates snapshot against BrainSnapshotSchema', () => {
    const brain = new SqliteBrain();
    brain.working.set('key', 'value');
    const snapshot = brain.serialize();
    expect(() => BrainSnapshotSchema.parse(snapshot)).not.toThrow();
    brain.close();
  });
});
```

## Files

- **Rewrite:** `packages/franken-brain/src/sqlite-brain.ts`
- **Add:** `packages/franken-brain/src/index.ts` (re-export `SqliteBrain`)
- **Add:** `packages/franken-brain/tests/unit/sqlite-brain.test.ts`
- **Add:** `packages/franken-brain/tests/integration/brain-serialize-hydrate.test.ts`
- **Modify:** `packages/franken-brain/package.json` — ensure only deps are `better-sqlite3` + `@frankenbeast/types`

## Exit Criteria

- `SqliteBrain` implements `IBrain` from `@frankenbeast/types`
- All three memory sub-systems work (working, episodic, recovery)
- `serialize()` produces a `BrainSnapshot` that passes `BrainSnapshotSchema` validation
- `hydrate()` creates a fully functional brain from a snapshot
- Round-trip test passes: state is preserved across serialize/hydrate
- Unit tests cover all methods on all three memory interfaces
- Integration test covers the full lifecycle
- `packages/franken-brain/package.json` has only `better-sqlite3` and `@frankenbeast/types` as dependencies
