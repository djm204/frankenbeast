CREATE TABLE IF NOT EXISTS episodic_traces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('success', 'failure', 'pending', 'compressed')),
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodic_project_task
  ON episodic_traces(project_id, task_id);

CREATE INDEX IF NOT EXISTS idx_episodic_status_ts
  ON episodic_traces(status, created_at);
