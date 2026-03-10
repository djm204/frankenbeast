# ADR-003: SQLite (better-sqlite3) for Episodic & Working Memory Persistence

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-brain team

## Context

Episodic memory (execution traces, task results) and the serialised snapshot of working memory must survive process restarts. The persistence layer must:

- Write synchronously within a tool-call cycle without blocking the event loop excessively
- Support structured queries: "give me all failed traces for `project_id = 'X'` in the last 7 days"
- Run with zero external infrastructure (local-first for development and CI)
- Be trivially replaceable in production (Redis, PostgreSQL) behind an interface

The project-outline.md lists "Redis or local SQLite for high-speed Working/Episodic access" as the expected approach.

## Decision

Use **`better-sqlite3`** (synchronous SQLite bindings) for Episodic and Working memory persistence.

- Synchronous API removes the need for async/await plumbing around the hot path
- File-based: database lives at `data/episodic.db` (gitignored)
- Schema managed by hand-written migrations in `src/persistence/migrations/`
- In tests: use `:memory:` database to avoid filesystem side effects

**Schema (initial):**
```sql
CREATE TABLE episodic_traces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('success', 'failure', 'pending')),
  payload     TEXT NOT NULL,  -- JSON blob
  created_at  INTEGER NOT NULL  -- Unix ms
);

CREATE INDEX idx_episodic_project_task ON episodic_traces(project_id, task_id);
CREATE INDEX idx_episodic_status_ts    ON episodic_traces(status, created_at);
```

## Consequences

### Positive
- Zero infrastructure — works in CI with no Docker, no Redis server
- Synchronous API simplifies the episodic store implementation considerably
- `:memory:` databases make unit tests fast and isolated
- SQL queries handle the structured recall patterns (project + status + recency) naturally

### Negative
- Synchronous I/O can block the event loop if payloads are very large — mitigated by size limits on `payload` column
- Not suitable for multi-process writes (single-agent context means this is acceptable for MVP)

### Risks
- Migration strategy is hand-rolled; if schema changes become frequent, consider Knex or Drizzle ORM

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Redis | Fast, supports TTL natively | Requires running server; no structured queries | Adds infra dependency to local dev and CI |
| `node:sqlite` (Node 22 built-in) | No npm dependency | Async API only in stable; experimental as of Node 22 | API not stable enough; `better-sqlite3` has more production use |
| LevelDB | Embedded, fast | Key-value only; no SQL queries for status/project filters | Requires building query layer on top |
