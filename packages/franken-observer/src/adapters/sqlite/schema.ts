export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS traces (
    id         TEXT    PRIMARY KEY,
    goal       TEXT    NOT NULL,
    status     TEXT    NOT NULL,
    startedAt  INTEGER NOT NULL,
    endedAt    INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS spans (
    id            TEXT    PRIMARY KEY,
    traceId       TEXT    NOT NULL,
    parentSpanId  TEXT,
    name          TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    startedAt     INTEGER NOT NULL,
    endedAt       INTEGER,
    durationMs    INTEGER,
    errorMessage  TEXT,
    metadata      TEXT    NOT NULL DEFAULT '{}',
    thoughtBlocks TEXT    NOT NULL DEFAULT '[]',
    FOREIGN KEY (traceId) REFERENCES traces(id)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_spans_traceId ON spans(traceId);
`

export const UPSERT_TRACE = `
  INSERT INTO traces (id, goal, status, startedAt, endedAt)
  VALUES (@id, @goal, @status, @startedAt, @endedAt)
  ON CONFLICT(id) DO UPDATE SET
    goal      = excluded.goal,
    status    = excluded.status,
    startedAt = excluded.startedAt,
    endedAt   = excluded.endedAt
`

export const UPSERT_SPAN = `
  INSERT INTO spans
    (id, traceId, parentSpanId, name, status, startedAt, endedAt,
     durationMs, errorMessage, metadata, thoughtBlocks)
  VALUES
    (@id, @traceId, @parentSpanId, @name, @status, @startedAt, @endedAt,
     @durationMs, @errorMessage, @metadata, @thoughtBlocks)
  ON CONFLICT(id) DO UPDATE SET
    status        = excluded.status,
    endedAt       = excluded.endedAt,
    durationMs    = excluded.durationMs,
    errorMessage  = excluded.errorMessage,
    metadata      = excluded.metadata,
    thoughtBlocks = excluded.thoughtBlocks
`

export const SELECT_TRACE = `SELECT * FROM traces WHERE id = ?`
export const SELECT_SPANS = `SELECT * FROM spans WHERE traceId = ? ORDER BY startedAt ASC`
export const SELECT_ALL_TRACE_IDS = `SELECT id FROM traces ORDER BY startedAt ASC`
