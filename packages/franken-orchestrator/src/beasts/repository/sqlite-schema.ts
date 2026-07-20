export const BEAST_SQLITE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS beast_runs (
    id TEXT PRIMARY KEY,
    tracked_agent_id TEXT,
    definition_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    execution_mode TEXT NOT NULL,
    config_snapshot TEXT NOT NULL,
    dispatched_by TEXT NOT NULL,
    dispatched_by_user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    current_attempt_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_heartbeat_at TEXT,
    last_heartbeat_sequence INTEGER NOT NULL DEFAULT 0,
    stop_reason TEXT,
    latest_exit_code INTEGER,
    FOREIGN KEY (tracked_agent_id) REFERENCES tracked_agents(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_beast_runs_created_at_id
    ON beast_runs(created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS beast_run_attempts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    pid INTEGER,
    started_at TEXT,
    finished_at TEXT,
    exit_code INTEGER,
    stop_reason TEXT,
    executor_metadata TEXT,
    FOREIGN KEY (run_id) REFERENCES beast_runs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS beast_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt_id TEXT,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES beast_runs(id),
    FOREIGN KEY (attempt_id) REFERENCES beast_run_attempts(id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_beast_run_events_run_sequence ON beast_run_events(run_id, sequence)',
  `CREATE TABLE IF NOT EXISTS beast_interview_sessions (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL,
    status TEXT NOT NULL,
    answers TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tracked_agents (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    created_by_user TEXT NOT NULL,
    init_action TEXT NOT NULL,
    init_config TEXT NOT NULL,
    chat_session_id TEXT,
    dispatch_run_id TEXT,
    execution_mode TEXT,
    module_config TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (dispatch_run_id) REFERENCES beast_runs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tracked_agent_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    level TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES tracked_agents(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_agents_created_at_id
    ON tracked_agents(created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_agents_status
    ON tracked_agents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_agent_events_type_agent
    ON tracked_agent_events(type, agent_id)`,
] as const;

export const BEAST_SQLITE_EVENT_UNIQUENESS_INDEX_STATEMENTS = [
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_beast_run_events_run_sequence ON beast_run_events(run_id, sequence)',
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_agent_events_agent_sequence ON tracked_agent_events(agent_id, sequence)',
] as const;
