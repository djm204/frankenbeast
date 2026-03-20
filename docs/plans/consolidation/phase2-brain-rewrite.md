# Phase 2: Rewrite franken-brain — Portable Memory

**Goal:** Replace the current overengineered franken-brain with a ~300-line SQLite-backed implementation that supports `serialize()`/`hydrate()` for cross-provider memory handoff.

**Dependencies:** Phase 1 (clean 8-package monorepo with no broken imports)

**Why this matters:** The `BrainSnapshot` is the foundation of provider-agnostic execution. When Claude hits a rate limit mid-task, the orchestrator serializes the brain state and hands it to Codex or Gemini. Without a working `serialize()`/`hydrate()` cycle, multi-provider failover is impossible.

---

## Design

### Three Memory Types

| Type | Purpose | Storage | Lifecycle |
|------|---------|---------|-----------|
| **Working** | Current task context — what the agent is doing right now | In-memory `Map`, flushed to SQLite on checkpoint | Cleared between runs |
| **Episodic** | Past events and learnings — what happened before | SQLite `episodic_events` table | Persists across runs |
| **Recovery** | Execution checkpoints for crash recovery | SQLite `checkpoints` table (JSON blob) | Persists until next successful run |

### BrainSnapshot Format

```typescript
interface BrainSnapshot {
  version: 1;
  timestamp: string;
  working: Record<string, unknown>;
  episodic: EpisodicEvent[];
  checkpoint: ExecutionState | null;
  metadata: {
    lastProvider: string;
    switchReason: string;
    totalTokensUsed: number;
  };
}
```

This is a JSON-serializable object that contains the full brain state. Each provider adapter receives this via `formatHandoff(snapshot)` and translates it to its own context format (system prompt for Claude, config for Codex, GEMINI.md for Gemini).

### SQLite Schema

```sql
CREATE TABLE working_memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON-serialized
  updated_at TEXT NOT NULL
);

CREATE TABLE episodic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,           -- 'success', 'failure', 'decision', 'observation'
  step TEXT,                    -- which execution step this relates to
  summary TEXT NOT NULL,        -- human-readable description
  details TEXT,                 -- JSON blob for structured data
  embedding BLOB,              -- nullable, for future vector search
  created_at TEXT NOT NULL
);

CREATE TABLE checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL,          -- JSON-serialized ExecutionState
  created_at TEXT NOT NULL
);
```

### v1 Recall Strategy

For v1, episodic recall uses keyword matching + recency:
- `recall(query)` does `SELECT ... WHERE summary LIKE '%keyword%' ORDER BY created_at DESC LIMIT ?`
- No embeddings — the `embedding` column exists but is nullable
- This is good enough for "what went wrong last time I tried this?" queries
- Embedding-based recall is a documented future enhancement

## Success Criteria

- `franken-brain` is ~300 lines (excluding tests)
- `serialize()` produces a valid `BrainSnapshot` JSON
- `hydrate(snapshot)` creates a new `SqliteBrain` with the same state
- Round-trip test: `serialize() → hydrate() → serialize()` produces identical output
- Old brain code is completely gone
- Only dependency: `better-sqlite3` + `@frankenbeast/types`

## Chunks

| # | Chunk | Committable Unit | Can Parallel? |
|---|-------|-----------------|--------------|
| 01 | [Brain interfaces + types](phase2-brain-rewrite/01_brain-interfaces-types.md) | New types in `franken-types` | First |
| 02 | [SqliteBrain implementation](phase2-brain-rewrite/02_sqlite-brain-implementation.md) | Core implementation | After 01 |
| 03 | [Episodic recall](phase2-brain-rewrite/03_episodic-recall.md) | Keyword/recency search | After 01 |
| 04 | [Delete old brain code](phase2-brain-rewrite/04_delete-old-brain.md) | Remove old implementation | After 02+03 |

**Parallelism:** Chunk 01 first (types needed by all). Chunks 02 and 03 can run in parallel. Chunk 04 after both are complete.

## Risks

| Risk | Mitigation |
|------|-----------|
| Brain rewrite loses existing functionality | Map existing brain tests to new interface BEFORE deleting old code (chunk 04). |
| `better-sqlite3` native binding issues in CI | Already used in current brain — not a new dependency. |
| BrainSnapshot format is wrong for provider handoff | Phase 3 will validate this when implementing `formatHandoff()`. Keep the format simple and extensible (version field). |
