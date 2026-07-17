import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  buildSloDashboardFromKanban,
  createSqliteSloDashboardSource,
} from '../../../src/availability/slo-dashboard.js';

function createKanbanDb() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'fbeast-slo-dashboard-')), 'kanban.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      block_kind TEXT
    );
    CREATE TABLE task_runs (
      id INTEGER PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      outcome TEXT,
      error TEXT
    );
    CREATE TABLE task_events (
      id INTEGER PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id INTEGER,
      kind TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return { db, dbPath };
}

describe('SLO dashboard', () => {
  it('produces six availability SLI metrics and normalized failure categories from Kanban data', async () => {
    const { db, dbPath } = createKanbanDb();
    db.exec(`
      INSERT INTO tasks (id, title, status, created_at, started_at, completed_at, block_kind) VALUES
        ('t_success_fast', 'success fast', 'done', 1000, 1060, 1300, NULL),
        ('t_success_slow', 'success slow', 'done', 1100, 1200, 1700, NULL),
        ('t_failed_provider', 'provider failed', 'done', 1200, 1400, 1900, NULL),
        ('t_blocked_approval', 'approval wait', 'blocked', 1300, 1500, NULL, 'approval'),
        ('t_running_worker', 'running worker', 'running', 1500, 1600, NULL, NULL),
        ('t_pending_old', 'pending old', 'ready', 1000, NULL, NULL, NULL);
      INSERT INTO task_runs (id, task_id, status, started_at, ended_at, outcome, error) VALUES
        (1, 't_success_fast', 'done', 1060, 1300, 'completed', NULL),
        (2, 't_success_slow', 'done', 1200, 1700, 'completed', NULL),
        (3, 't_failed_provider', 'failed', 1400, 1900, 'failed', 'Provider rate limit exceeded'),
        (4, 't_blocked_approval', 'blocked', 1500, 1600, 'blocked', 'Waiting for approval'),
        (5, 't_running_worker', 'running', 1600, NULL, NULL, NULL);
      INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES
        ('t_success_fast', 1, 'spawned', '{}', 1070),
        ('t_success_fast', 1, 'commented', '{}', 1120),
        ('t_success_slow', 2, 'spawned', '{}', 1280),
        ('t_success_slow', 2, 'heartbeat', '{}', 1400),
        ('t_failed_provider', 3, 'spawned', '{}', 1550),
        ('t_failed_provider', 3, 'crashed', '{}', 1900),
        ('t_blocked_approval', 4, 'blocked', '{"kind":"approval"}', 1510),
        ('t_blocked_approval', 4, 'unblocked', '{}', 1570);
    `);

    const dashboard = await buildSloDashboardFromKanban(
      createSqliteSloDashboardSource({ kanbanDbPath: dbPath, now: 2_000 }),
    );

    expect(dashboard.windows.map((window) => window.label)).toEqual(['1h', '24h', '7d']);
    const oneHour = dashboard.windows[0];
    expect(oneHour.metrics.map((metric) => metric.id)).toEqual([
      'run_success_rate',
      'time_to_first_output_p50_ms',
      'time_to_closeout_p50_ms',
      'provider_wait_p50_ms',
      'queue_age_p50_ms',
      'approval_latency_p50_ms',
    ]);
    expect(oneHour.metrics.find((metric) => metric.id === 'run_success_rate')).toMatchObject({ value: 50, unit: 'percent', status: 'breach' });
    expect(oneHour.metrics.find((metric) => metric.id === 'time_to_first_output_p50_ms')?.value).toBe(200_000);
    expect(oneHour.metrics.find((metric) => metric.id === 'time_to_closeout_p50_ms')?.value).toBe(600_000);
    expect(oneHour.metrics.find((metric) => metric.id === 'provider_wait_p50_ms')?.value).toBe(80_000);
    expect(oneHour.metrics.find((metric) => metric.id === 'queue_age_p50_ms')?.value).toBe(150_000);
    expect(oneHour.metrics.find((metric) => metric.id === 'approval_latency_p50_ms')?.value).toBe(60_000);
    expect(oneHour.failureCategories).toEqual([
      { category: 'approval', count: 1 },
      { category: 'provider', count: 1 },
    ]);
    expect(dashboard.source).toEqual({ kanban: true, approvals: true, runs: true });
    expect(dashboard.generatedAt).toBe('1970-01-01T00:31:40.000Z');
    db.close();
  });

  it('falls back safely for legacy task-only Kanban schemas', async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'fbeast-slo-legacy-')), 'kanban.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY,
        task_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO tasks (id, title, status, created_at) VALUES
        ('t_legacy_pending', 'legacy pending', 'ready', 1000),
        ('t_legacy_archived', 'legacy archived', 'archived', 1100);
    `);

    const dashboard = await buildSloDashboardFromKanban(
      createSqliteSloDashboardSource({ kanbanDbPath: dbPath, now: 2_000 }),
    );

    const oneHour = dashboard.windows[0];
    expect(dashboard.source).toEqual({ kanban: true, approvals: false, runs: false });
    expect(dashboard.generatedAt).toBe('1970-01-01T00:18:20.000Z');
    expect(oneHour.metrics.find((metric) => metric.id === 'queue_age_p50_ms')?.value).toBe(950_000);
    expect(oneHour.failureCategories).toEqual([{ category: 'other', count: 1 }]);
    db.close();
  });
});
