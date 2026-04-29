import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteAnalyticsService } from '../../../src/analytics/sqlite-analytics-service.js';
import type { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';

function seedFbeastDb(dbPath: string) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      hash TEXT,
      parent_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE cost_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE governor_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      context TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE firewall_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_hash TEXT NOT NULL,
      verdict TEXT NOT NULL,
      matched_patterns TEXT,
      created_at TEXT NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'session-a',
    'tool_call',
    JSON.stringify({ toolName: 'fbeast_observer_log', phase: 'mcp', summary: 'Logged audit event' }),
    'hash-a',
    null,
    '2026-04-28T12:00:00.000Z',
  );
  db.prepare(`
    INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'session-b',
    'tool_error',
    JSON.stringify({ toolName: 'fbeast_firewall_scan', error: 'scan failed' }),
    'hash-b',
    null,
    '2026-04-28T12:05:00.000Z',
  );
  db.prepare(`
    INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('session-a', 'gpt-5.4', 100, 40, 0.42, '2026-04-28T12:01:00.000Z');
  db.prepare(`
    INSERT INTO governor_log (action, context, decision, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'rm -rf tmp',
    JSON.stringify({ sessionId: 'session-a', toolName: 'exec_command' }),
    'denied',
    'Destructive command requires review',
    '2026-04-28T12:02:00.000Z',
  );
  db.prepare(`
    INSERT INTO firewall_log (input_hash, verdict, matched_patterns, created_at)
    VALUES (?, ?, ?, ?)
  `).run('input-a', 'flagged', JSON.stringify(['ignore previous instructions']), '2026-04-28T12:03:00.000Z');
  db.close();
}

describe('createSqliteAnalyticsService', () => {
  let workDir: string | undefined;
  let previousTz: string | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
    previousTz = undefined;
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('aggregates summary metrics across observer, governor, firewall, and cost rows', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    seedFbeastDb(dbPath);

    const service = createSqliteAnalyticsService({ dbPath });
    const summary = await service.getSummary({});

    expect(summary.totalEvents).toBe(5);
    expect(summary.uniqueSessions).toBe(2);
    expect(summary.denialCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.failureCount).toBe(0);
    expect(summary.securityDetectionCount).toBe(1);
    expect(summary.tokenTotals).toEqual({ prompt: 100, completion: 40, total: 140 });
    expect(summary.costTotals.usd).toBe(0.42);
  });

  it('filters events by session, tool query, and outcome', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    seedFbeastDb(dbPath);

    const service = createSqliteAnalyticsService({ dbPath });
    const result = await service.listEvents({
      sessionId: 'session-a',
      toolQuery: 'exec',
      outcome: 'denied',
    });

    expect(result.total).toBe(1);
    expect(result.events[0]).toMatchObject({
      source: 'governor',
      sessionId: 'session-a',
      toolName: 'exec_command',
      outcome: 'denied',
      summary: 'Destructive command requires review',
    });
  });

  it('returns session options with failure and rejection counts', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    seedFbeastDb(dbPath);

    const service = createSqliteAnalyticsService({ dbPath });
    const sessions = await service.listSessions({});

    expect(sessions).toEqual([
      expect.objectContaining({ id: 'session-b', eventCount: 1, failureCount: 1 }),
      expect.objectContaining({ id: 'session-a', eventCount: 3, failureCount: 1 }),
    ]);
  });

  it('looks up normalized event detail by id', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    seedFbeastDb(dbPath);

    const service = createSqliteAnalyticsService({ dbPath });
    const events = await service.listEvents({ outcome: 'detected' });
    const detail = await service.getEvent(events.events[0]!.id);

    expect(detail).toMatchObject({
      source: 'security',
      outcome: 'detected',
      severity: 'warning',
    });
    expect(detail?.raw).toMatchObject({ verdict: 'flagged' });
  });

  it('sorts mixed SQLite and ISO event timestamps by chronological time', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE cost_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('session-late', 'gpt-5.4', 1, 1, 0.01, '2026-04-28 23:59:59');
    db.close();

    const runs = {
      listRuns: () => [{
        id: 'run-early',
        definitionId: 'review-bot',
        definitionVersion: 1,
        status: 'failed',
        executionMode: 'process',
        configSnapshot: {},
        dispatchedBy: 'dashboard',
        dispatchedByUser: 'operator',
        createdAt: '2026-04-28T00:00:00.000Z',
        attemptCount: 1,
        latestExitCode: 1,
      }],
    } satisfies Pick<BeastRunService, 'listRuns'>;

    const service = createSqliteAnalyticsService({ dbPath, runs: runs as BeastRunService });
    const result = await service.listEvents({ timeWindow: 'all' });

    expect(result.events.map((event) => event.id)).toEqual(['cost:1', 'beast-run:run-early']);
  });

  it('treats timezone-less SQLite timestamps as UTC for time-window cutoffs', async () => {
    previousTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T12:00:00.000Z'));
    workDir = await mkdtemp(join(tmpdir(), 'franken-analytics-'));
    const dbPath = join(workDir, 'beast.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE cost_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('session-old', 'gpt-5.4', 1, 1, 0.01, '2026-04-27 08:30:00');
    db.close();

    const service = createSqliteAnalyticsService({ dbPath });
    const result = await service.listEvents({ timeWindow: '24h' });

    expect(result.events).toEqual([]);
  });
});
