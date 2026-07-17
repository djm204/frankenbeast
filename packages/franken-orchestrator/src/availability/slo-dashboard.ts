import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export type SloMetricStatus = 'ok' | 'warning' | 'breach' | 'unknown';
export type SloMetricUnit = 'percent' | 'milliseconds' | 'count';

export interface SloMetric {
  id: string;
  label: string;
  value: number | null;
  unit: SloMetricUnit;
  target: number;
  comparator: '>=' | '<=';
  status: SloMetricStatus;
  description: string;
}

export interface SloFailureCategory {
  category: string;
  count: number;
}

export interface SloWindowDashboard {
  label: '1h' | '24h' | '7d';
  seconds: number;
  metrics: SloMetric[];
  failureCategories: SloFailureCategory[];
  sampleSize: number;
}

export interface SloDashboard {
  generatedAt: string;
  source: {
    kanban: boolean;
    approvals: boolean;
    runs: boolean;
  };
  windows: SloWindowDashboard[];
}

export interface SloRunRecord {
  taskId: string;
  taskStatus: string;
  taskCreatedAt: number;
  taskStartedAt?: number | null;
  taskCompletedAt?: number | null;
  runId?: number | null;
  runStatus?: string | null;
  runStartedAt?: number | null;
  runEndedAt?: number | null;
  outcome?: string | null;
  error?: string | null;
  firstOutputAt?: number | null;
  spawnedAt?: number | null;
}

export interface SloApprovalRecord {
  taskId: string;
  requestedAt: number;
  decidedAt: number;
}

export interface SloDashboardSource {
  now: number;
  runs: SloRunRecord[];
  approvals: SloApprovalRecord[];
  hasKanbanData: boolean;
  hasRunData: boolean;
  hasApprovalData: boolean;
}

const WINDOWS: ReadonlyArray<{ label: '1h' | '24h' | '7d'; seconds: number }> = [
  { label: '1h', seconds: 60 * 60 },
  { label: '24h', seconds: 24 * 60 * 60 },
  { label: '7d', seconds: 7 * 24 * 60 * 60 },
];

const TARGETS = {
  runSuccessRate: 95,
  firstOutputMs: 5 * 60 * 1000,
  closeoutMs: 24 * 60 * 60 * 1000,
  providerWaitMs: 2 * 60 * 1000,
  queueAgeMs: 15 * 60 * 1000,
  approvalLatencyMs: 60 * 60 * 1000,
} as const;

export async function buildSloDashboardFromKanban(source: SloDashboardSource): Promise<SloDashboard> {
  return {
    generatedAt: new Date(sourceTimestamp(source) * 1000).toISOString(),
    source: {
      kanban: source.hasKanbanData,
      approvals: source.hasApprovalData,
      runs: source.hasRunData,
    },
    windows: WINDOWS.map((window) => buildWindow(source, window.label, window.seconds)),
  };
}

export interface SqliteSloDashboardSourceOptions {
  kanbanDbPath: string;
  now?: number | undefined;
}

export function createSqliteSloDashboardSource(options: SqliteSloDashboardSourceOptions): SloDashboardSource {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!existsSync(options.kanbanDbPath)) {
    return { now, runs: [], approvals: [], hasKanbanData: false, hasRunData: false, hasApprovalData: false };
  }

  const db = new Database(options.kanbanDbPath, { readonly: true, fileMustExist: true });
  try {
    const hasTasks = hasTable(db, 'tasks');
    const hasRuns = hasTable(db, 'task_runs');
    const hasEvents = hasTable(db, 'task_events');
    const hasComments = hasTable(db, 'comments');
    return {
      now,
      runs: hasTasks ? readRunRecords(db, hasRuns, hasEvents, hasComments, now) : [],
      approvals: hasEvents ? readApprovalRecords(db, sampleTimestamp(now)) : [],
      hasKanbanData: hasTasks,
      hasRunData: hasRuns,
      hasApprovalData: hasEvents,
    };
  } finally {
    db.close();
  }
}

function buildWindow(source: SloDashboardSource, label: '1h' | '24h' | '7d', seconds: number): SloWindowDashboard {
  const sampleNow = sampleTimestamp(source.now);
  const since = source.now - seconds;
  const runs = source.runs.filter((run) => windowTimestamp(run, sampleNow) >= since);
  const approvals = source.approvals.filter((approval) => approval.decidedAt >= since);
  const successfulRuns = runs.filter(isSuccessfulRun).length;
  const totalTerminalRuns = runs.filter(isTerminalRun).length;
  const successRate = totalTerminalRuns === 0 ? null : round((successfulRuns / totalTerminalRuns) * 100, 2);
  const firstOutputSamples = runs
    .map((run) => firstOutputDurationMs(run, sampleNow))
    .filter(isNumber);
  const closeoutSamples = taskDurationSamples(runs, (run) => durationMs(run.taskCreatedAt, run.taskCompletedAt));
  const providerWaitSamples = runs
    .map((run) => providerWaitDurationMs(run, sampleNow))
    .filter(isNumber);
  const queueAgeSamples = taskDurationSamples(runs, (run) => durationMs(run.taskCreatedAt, run.taskStartedAt ?? run.runStartedAt ?? sampleNow));
  const approvalSamples = approvals
    .map((approval) => durationMs(approval.requestedAt, approval.decidedAt))
    .filter(isNumber);

  return {
    label,
    seconds,
    metrics: [
      metric('run_success_rate', 'Run success rate', successRate, 'percent', TARGETS.runSuccessRate, '>=', 'Completed terminal runs divided by all terminal Kanban runs.'),
      metric('time_to_first_output_p50_ms', 'Time to first output p50', percentile(firstOutputSamples, 50), 'milliseconds', TARGETS.firstOutputMs, '<=', 'Median time from run start to first heartbeat, comment, block, or completion signal.'),
      metric('time_to_closeout_p50_ms', 'Time to merge/closeout p50', percentile(closeoutSamples, 50), 'milliseconds', TARGETS.closeoutMs, '<=', 'Median time from task creation to done/completed closeout.'),
      metric('provider_wait_p50_ms', 'Provider wait p50', percentile(providerWaitSamples, 50), 'milliseconds', TARGETS.providerWaitMs, '<=', 'Median time from run claim/start to worker spawn signal.'),
      metric('queue_age_p50_ms', 'Queue age p50', percentile(queueAgeSamples, 50), 'milliseconds', TARGETS.queueAgeMs, '<=', 'Median time from task creation to first start/claim.'),
      metric('approval_latency_p50_ms', 'Approval latency p50', percentile(approvalSamples, 50), 'milliseconds', TARGETS.approvalLatencyMs, '<=', 'Median time from approval/HITL block to unblock decision.'),
    ],
    failureCategories: failureCategories(runs),
    sampleSize: runs.length,
  };
}

function readRunRecords(db: Database.Database, hasRuns: boolean, hasEvents: boolean, hasComments: boolean, now: number): SloRunRecord[] {
  const cutoff = now - Math.max(...WINDOWS.map((window) => window.seconds));
  const taskStartedExpr = columnExpr(db, 'tasks', 'started_at', 't', 'NULL');
  const taskCompletedExpr = columnExpr(db, 'tasks', 'completed_at', 't', 'NULL');
  const attachCommentOutput = (rows: SloRunRecord[]): SloRunRecord[] => {
    if (!hasComments) return rows;
    const comments = db.prepare(`
      SELECT task_id AS taskId,
             created_at AS createdAt
      FROM comments
      WHERE created_at >= @cutoff
      ORDER BY task_id, created_at
    `).all({ cutoff }) as Array<{ taskId: string; createdAt: number }>;
    const commentsByTask = new Map<string, number[]>();
    for (const comment of comments) {
      const bucket = commentsByTask.get(comment.taskId) ?? [];
      bucket.push(comment.createdAt);
      commentsByTask.set(comment.taskId, bucket);
    }
    return rows.map((row) => {
      const start = row.runStartedAt ?? row.taskStartedAt ?? row.taskCreatedAt;
      const firstComment = commentsByTask.get(row.taskId)?.find((createdAt) => createdAt >= start);
      return {
        ...row,
        firstOutputAt: row.firstOutputAt ?? firstComment ?? null,
      };
    });
  };
  if (!hasRuns) {
    return attachCommentOutput(db.prepare(`
      SELECT id AS taskId,
             status AS taskStatus,
             created_at AS taskCreatedAt,
             ${columnExpr(db, 'tasks', 'started_at', undefined, 'NULL')} AS taskStartedAt,
             ${columnExpr(db, 'tasks', 'completed_at', undefined, 'NULL')} AS taskCompletedAt
      FROM tasks
      WHERE created_at >= @cutoff
         OR lower(status) NOT IN ('done', 'completed', 'complete', 'success', 'failed', 'error', 'crashed', 'timed_out', 'timeout', 'archived', 'cancelled', 'canceled', 'deleted', 'stopped')
    `).all({ cutoff }) as SloRunRecord[]);
  }

  const rows = db.prepare(`
    SELECT t.id AS taskId,
           t.status AS taskStatus,
           t.created_at AS taskCreatedAt,
           ${taskStartedExpr} AS taskStartedAt,
           ${taskCompletedExpr} AS taskCompletedAt,
           r.id AS runId,
           r.status AS runStatus,
           r.started_at AS runStartedAt,
           r.ended_at AS runEndedAt,
           r.outcome AS outcome,
           r.error AS error
    FROM tasks t
    LEFT JOIN task_runs r ON r.task_id = t.id
    WHERE t.created_at >= @cutoff
       OR ${taskStartedExpr} >= @cutoff
       OR ${taskCompletedExpr} >= @cutoff
       OR r.started_at >= @cutoff
       OR r.ended_at >= @cutoff
       OR lower(t.status) NOT IN ('done', 'completed', 'complete', 'success', 'failed', 'error', 'crashed', 'timed_out', 'timeout', 'archived', 'cancelled', 'canceled', 'deleted', 'stopped')
    ORDER BY t.id, r.started_at
  `).all({ cutoff }) as SloRunRecord[];

  if (!hasEvents) {
    return attachCommentOutput(rows);
  }

  const outputKinds = ['commented', 'heartbeat', 'blocked', 'completed', 'protocol_violation', 'crashed', 'gave_up'];
  const runIds = [...new Set(rows.map((row) => row.runId).filter(isNumber))];
  const outputEvents = readEventMinimums(db, runIds, outputKinds, 'firstOutputAt');
  const spawnedEvents = readEventMinimums(db, runIds, ['spawned'], 'spawnedAt');
  const firstOutputByRun = new Map(outputEvents.map((row) => [row.runId, row.firstOutputAt]));
  const spawnedByRun = new Map(spawnedEvents.map((row) => [row.runId, row.spawnedAt]));

  return attachCommentOutput(rows.map((row) => ({
    ...row,
    firstOutputAt: row.runId ? firstOutputByRun.get(row.runId) ?? null : null,
    spawnedAt: row.runId ? spawnedByRun.get(row.runId) ?? null : null,
  })));
}

function readEventMinimums<TField extends 'firstOutputAt' | 'spawnedAt'>(
  db: Database.Database,
  runIds: number[],
  kinds: string[],
  field: TField,
): Array<{ runId: number } & Record<TField, number>> {
  if (runIds.length === 0 || kinds.length === 0) return [];
  const runPlaceholders = runIds.map(() => '?').join(', ');
  const kindPlaceholders = kinds.map(() => '?').join(', ');
  return db.prepare(`
    SELECT run_id AS runId,
           MIN(created_at) AS ${field}
    FROM task_events
    WHERE run_id IN (${runPlaceholders})
      AND kind IN (${kindPlaceholders})
    GROUP BY run_id
  `).all(...runIds, ...kinds) as Array<{ runId: number } & Record<TField, number>>;
}

function readApprovalRecords(db: Database.Database, now: number): SloApprovalRecord[] {
  const cutoff = now - Math.max(...WINDOWS.map((window) => window.seconds));
  const rows = db.prepare(`
    SELECT task_id AS taskId,
           kind,
           payload,
           created_at AS createdAt
    FROM task_events e
    WHERE kind IN ('blocked', 'unblocked')
      AND (
        created_at >= @cutoff
        OR (
          kind = 'blocked'
          AND payload IS NOT NULL
          AND lower(payload) GLOB '*approval*'
          AND EXISTS (
            SELECT 1 FROM task_events u
            WHERE u.task_id = e.task_id
              AND u.kind = 'unblocked'
              AND u.created_at >= @cutoff
              AND u.created_at >= e.created_at
          )
        )
        OR (
          kind = 'blocked'
          AND payload IS NOT NULL
          AND lower(payload) GLOB '*hitl*'
          AND EXISTS (
            SELECT 1 FROM task_events u
            WHERE u.task_id = e.task_id
              AND u.kind = 'unblocked'
              AND u.created_at >= @cutoff
              AND u.created_at >= e.created_at
          )
        )
        OR (
          kind = 'blocked'
          AND payload IS NOT NULL
          AND (lower(payload) GLOB '*approval*' OR lower(payload) GLOB '*hitl*')
          AND NOT EXISTS (
            SELECT 1 FROM task_events u
            WHERE u.task_id = e.task_id
              AND u.kind = 'unblocked'
              AND u.created_at >= e.created_at
          )
        )
      )
    ORDER BY task_id, created_at
  `).all({ cutoff }) as Array<{ taskId: string; kind: string; payload: string | null; createdAt: number }>;
  const pending = new Map<string, number>();
  const approvals: SloApprovalRecord[] = [];
  for (const row of rows) {
    if (row.kind === 'blocked' && isApprovalBlock(row.payload)) {
      if (!pending.has(row.taskId)) {
        pending.set(row.taskId, row.createdAt);
      }
    } else if (row.kind === 'unblocked') {
      const requestedAt = pending.get(row.taskId);
      if (requestedAt !== undefined && row.createdAt >= requestedAt) {
        approvals.push({ taskId: row.taskId, requestedAt, decidedAt: row.createdAt });
        pending.delete(row.taskId);
      }
    }
  }
  for (const [taskId, requestedAt] of pending.entries()) {
    if (now >= requestedAt) {
      approvals.push({ taskId, requestedAt, decidedAt: now });
    }
  }
  return approvals;
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>).some((row) => row.name === column);
}

function columnExpr(db: Database.Database, table: string, column: string, tableAlias?: string | undefined, fallback = 'NULL'): string {
  if (!hasColumn(db, table, column)) return fallback;
  return tableAlias ? `${tableAlias}.${column}` : column;
}

function isApprovalBlock(payload: string | null): boolean {
  if (!payload) return false;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return JSON.stringify(parsed).toLowerCase().includes('approval') || JSON.stringify(parsed).toLowerCase().includes('hitl');
  } catch {
    return /approval|hitl/iu.test(payload);
  }
}

function metric(
  id: string,
  label: string,
  value: number | null,
  unit: SloMetricUnit,
  target: number,
  comparator: '>=' | '<=',
  description: string,
): SloMetric {
  return {
    id,
    label,
    value,
    unit,
    target,
    comparator,
    status: metricStatus(value, target, comparator),
    description,
  };
}

function metricStatus(value: number | null, target: number, comparator: '>=' | '<='): SloMetricStatus {
  if (value === null) return 'unknown';
  if (comparator === '>=') {
    if (value >= target) return 'ok';
    if (value >= target * 0.9) return 'warning';
    return 'breach';
  }
  if (value <= target) return 'ok';
  if (value <= target * 1.25) return 'warning';
  return 'breach';
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return Math.round(lowerValue + (upperValue - lowerValue) * (index - lower));
}

function durationMs(start: number | null | undefined, end: number | null | undefined): number | null {
  if (!isNumber(start) || !isNumber(end) || end < start) return null;
  return (end - start) * 1000;
}

function taskDurationSamples(runs: SloRunRecord[], readDuration: (run: SloRunRecord) => number | null): number[] {
  const samples = new Map<string, number>();
  for (const run of runs) {
    const duration = readDuration(run);
    if (duration !== null && !samples.has(run.taskId)) {
      samples.set(run.taskId, duration);
    }
  }
  return [...samples.values()];
}

function firstOutputDurationMs(run: SloRunRecord, now: number): number | null {
  const start = run.runStartedAt ?? run.taskStartedAt;
  if (!isNumber(start)) return null;
  const end = run.firstOutputAt ?? (isTerminalRun(run) ? run.runEndedAt ?? run.taskCompletedAt : now);
  return durationMs(start, end);
}

function providerWaitDurationMs(run: SloRunRecord, now: number): number | null {
  if (!isNumber(run.runStartedAt)) return null;
  const end = run.spawnedAt ?? (isTerminalRun(run) ? null : now);
  return durationMs(run.runStartedAt, end);
}

function recordTimestamp(run: SloRunRecord): number {
  return run.runEndedAt ?? run.taskCompletedAt ?? run.runStartedAt ?? run.taskStartedAt ?? run.taskCreatedAt;
}

function windowTimestamp(run: SloRunRecord, now: number): number {
  return isTerminalRun(run) ? recordTimestamp(run) : now;
}

function isSuccessfulRun(run: SloRunRecord): boolean {
  return ['completed', 'complete', 'done', 'success'].includes(String(run.outcome ?? run.runStatus ?? run.taskStatus).toLowerCase());
}

function isTerminalRun(run: SloRunRecord): boolean {
  const value = String(run.outcome ?? run.runStatus ?? run.taskStatus).toLowerCase();
  if (value === 'blocked') {
    return isNumber(run.runEndedAt) || isNumber(run.taskCompletedAt);
  }
  return ['completed', 'complete', 'done', 'success', 'failed', 'error', 'crashed', 'timed_out', 'timeout', 'archived', 'cancelled', 'canceled', 'deleted', 'stopped'].includes(value);
}

function sourceTimestamp(source: SloDashboardSource): number {
  const timestamps = [
    ...source.runs.flatMap((run) => [recordTimestamp(run), run.firstOutputAt, run.spawnedAt]),
    ...source.approvals.map((approval) => approval.decidedAt),
  ].filter(isNumber);
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function sampleTimestamp(now: number): number {
  return Math.floor(now / 60) * 60;
}

function failureCategories(runs: SloRunRecord[]): SloFailureCategory[] {
  const counts = new Map<string, number>();
  for (const run of runs) {
    if (!isTerminalRun(run) || isSuccessfulRun(run)) continue;
    const category = normalizeFailureCategory(run.error ?? run.outcome ?? run.runStatus ?? run.taskStatus);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function normalizeFailureCategory(value: string | null | undefined): string {
  const text = String(value ?? 'unknown').toLowerCase();
  if (/approval|hitl|human|blocked/.test(text)) return 'approval';
  if (/provider|rate limit|quota|model|llm|openai|anthropic|codex|ollama/.test(text)) return 'provider';
  if (/ci|test|typecheck|lint|build/.test(text)) return 'ci';
  if (/github|git|merge|pull request|pr /.test(text)) return 'github';
  if (/timeout|timed out|stale/.test(text)) return 'timeout';
  if (/crash|exception|traceback|error/.test(text)) return 'runtime';
  return 'other';
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
