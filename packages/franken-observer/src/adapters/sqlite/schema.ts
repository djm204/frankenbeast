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
  CREATE INDEX IF NOT EXISTS idx_spans_traceId_startedAt ON spans(traceId, startedAt);
  CREATE INDEX IF NOT EXISTS idx_traces_startedAt ON traces(startedAt);

  CREATE TABLE IF NOT EXISTS compaction_events (
    sessionId      TEXT    NOT NULL,
    runId          TEXT    NOT NULL,
    generation     INTEGER NOT NULL,
    triggerReason  TEXT    NOT NULL CHECK (triggerReason IN ('threshold', 'manual')),
    tokensBefore   INTEGER NOT NULL CHECK (tokensBefore >= 0),
    tokensAfter    INTEGER NOT NULL CHECK (tokensAfter >= 0),
    timestamp      INTEGER NOT NULL,
    PRIMARY KEY (runId, sessionId, generation)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_compaction_events_session_timestamp
    ON compaction_events(sessionId, timestamp);
  CREATE INDEX IF NOT EXISTS idx_compaction_events_timestamp
    ON compaction_events(timestamp);
`

export const MIGRATE_COMPACTION_EVENT_IDENTITY = `
  BEGIN IMMEDIATE;
  ALTER TABLE compaction_events RENAME TO compaction_events_legacy;

  CREATE TABLE compaction_events (
    sessionId      TEXT    NOT NULL,
    runId          TEXT    NOT NULL,
    generation     INTEGER NOT NULL,
    triggerReason  TEXT    NOT NULL CHECK (triggerReason IN ('threshold', 'manual')),
    tokensBefore   INTEGER NOT NULL CHECK (tokensBefore >= 0),
    tokensAfter    INTEGER NOT NULL CHECK (tokensAfter >= 0),
    timestamp      INTEGER NOT NULL,
    PRIMARY KEY (runId, sessionId, generation)
  ) STRICT;

  INSERT INTO compaction_events
    (sessionId, runId, generation, triggerReason, tokensBefore, tokensAfter, timestamp)
  SELECT sessionId, runId, generation, triggerReason, tokensBefore, tokensAfter, timestamp
  FROM compaction_events_legacy;

  DROP TABLE compaction_events_legacy;
  CREATE INDEX idx_compaction_events_session_timestamp
    ON compaction_events(sessionId, timestamp);
  CREATE INDEX idx_compaction_events_timestamp
    ON compaction_events(timestamp);
  COMMIT;
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
export const SELECT_TRACE_SUMMARIES = `
  SELECT
    traces.id,
    traces.goal,
    traces.status,
    traces.startedAt,
    (SELECT COUNT(*) FROM spans WHERE spans.traceId = traces.id) AS spanCount
  FROM traces
  ORDER BY traces.startedAt ASC
`

export const DELETE_SPANS_BY_TRACE = `DELETE FROM spans WHERE traceId = ?`
export const DELETE_COMPACTIONS_BY_RUN = `DELETE FROM compaction_events WHERE runId = ?`
export const DELETE_COMPACTIONS_BEFORE = `DELETE FROM compaction_events WHERE timestamp < ?`
export const DELETE_TRACE = `DELETE FROM traces WHERE id = ?`

export const UPSERT_COMPACTION_EVENT = `
  INSERT INTO compaction_events
    (sessionId, runId, generation, triggerReason, tokensBefore, tokensAfter, timestamp)
  VALUES
    (@sessionId, @runId, @generation, @triggerReason, @tokensBefore, @tokensAfter, @timestamp)
  ON CONFLICT(runId, sessionId, generation) DO UPDATE SET
    triggerReason = excluded.triggerReason,
    tokensBefore  = excluded.tokensBefore,
    tokensAfter   = excluded.tokensAfter,
    timestamp     = excluded.timestamp
`

export const SELECT_COMPACTION_EVENTS = `
  SELECT sessionId, runId, generation, triggerReason, tokensBefore, tokensAfter, timestamp
  FROM compaction_events
  WHERE sessionId = @sessionId AND timestamp >= @since
  ORDER BY timestamp DESC, generation DESC
  LIMIT @limit
`

export const SELECT_COMPACTION_AGGREGATE = `
  SELECT COUNT(*) AS count, MAX(timestamp) AS latestAt
  FROM compaction_events
  WHERE sessionId = @sessionId AND timestamp >= @since AND timestamp <= @before
`
