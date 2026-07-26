import { readdir, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { redactSensitiveText } from '../../logging/redaction.js';
import type { RuntimeAdapter, RuntimeEventRequest, RuntimeSnapshotRequest } from '../runtime-adapter.js';
import {
  RuntimeEventPageSchema,
  RuntimeProviderSchema,
  RuntimeSnapshotSchema,
  type RuntimeAgent,
  type RuntimeBlocker,
  type RuntimeEvent,
  type RuntimeEventPage,
  type RuntimeProvider,
  type RuntimeRun,
  type RuntimeSnapshot,
  type RuntimeTask,
  type RuntimeWorkspace,
} from '../runtime-schemas.js';

export interface HermesRuntimeAdapterOptions {
  hermesHome?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  now?: (() => Date) | undefined;
  busyTimeoutMs?: number | undefined;
}

interface DatabaseSource {
  workspaceId: string;
  name: string;
  kind: 'workspace' | 'board';
  path: string;
}

interface InspectedSource extends DatabaseSource {
  compatible: boolean;
  message?: string | undefined;
}

type RuntimeRow = Record<string, unknown>;

interface CursorValue {
  occurredAt: string;
  workspaceId: string;
  source: 'comment' | 'event';
  sourceId: number;
}

const REQUIRED_SCHEMA: Record<string, string[]> = {
  tasks: ['id', 'title', 'status', 'created_at', 'workspace_kind'],
  task_runs: ['id', 'task_id', 'status', 'started_at'],
  task_events: ['id', 'task_id', 'kind', 'created_at'],
};
const DEFAULT_ACTIVITY_LIMIT = 100;
const MAX_ACTIVITY_LIMIT = 500;
const MAX_SUMMARY_CHARS = 512;
const ABSOLUTE_PATH_RE = /(?:^|\s)(\/(?:[^\s"']+\/?)+|[A-Za-z]:[\\/](?:[^\s"']+))/gu;

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function optionalHome(options: HermesRuntimeAdapterOptions): string | undefined {
  const env = options.env ?? process.env;
  const value = options.hermesHome ?? env['HERMES_HOME'];
  return value?.trim() || undefined;
}

function prefixed(workspaceId: string, id: string): string {
  return `${workspaceId}:${id}`;
}

function taskId(workspaceId: string, id: unknown): string {
  return prefixed(workspaceId, String(id));
}

function agentId(workspaceId: string, id: string): string {
  return prefixed(workspaceId, id);
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function requiredTimestamp(value: unknown): string {
  const normalized = timestamp(value);
  if (!normalized) throw new Error('Hermes row contains an invalid required timestamp');
  return normalized;
}

function boundedText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const redacted = redactSensitiveText(value)
    .replace(ABSOLUTE_PATH_RE, (match, path: string) => match.replace(path, '[REDACTED_HOST_PATH]'));
  return redacted.length <= MAX_SUMMARY_CHARS ? redacted : `${redacted.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

function mapTaskState(status: unknown): RuntimeTask['state'] {
  switch (status) {
    case 'todo':
    case 'scheduled': return 'queued';
    case 'ready': return 'ready';
    case 'running': return 'running';
    case 'blocked': return 'blocked';
    case 'done':
    case 'completed': return 'succeeded';
    case 'failed':
    case 'gave_up':
    case 'crashed':
    case 'timed_out':
    case 'spawn_failed': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'archived': return 'archived';
    default: return 'unknown';
  }
}

function mapRunState(status: unknown, outcome: unknown): 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'unknown' {
  const value = outcome ?? status;
  switch (value) {
    case 'scheduled':
    case 'ready': return 'queued';
    case 'running': return 'running';
    case 'blocked': return 'blocked';
    case 'done':
    case 'completed': return 'succeeded';
    case 'cancelled': return 'cancelled';
    case 'crashed':
    case 'failed':
    case 'gave_up':
    case 'timed_out':
    case 'spawn_failed': return 'failed';
    default: return 'unknown';
  }
}

function blockerCategory(value: unknown): 'dependency' | 'needs-input' | 'capability' | 'transient' | 'unknown' {
  switch (value) {
    case 'dependency': return 'dependency';
    case 'needs_input': return 'needs-input';
    case 'capability': return 'capability';
    case 'transient': return 'transient';
    default: return 'unknown';
  }
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_ACTIVITY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ACTIVITY_LIMIT) {
    throw new RangeError(`activity limit must be an integer between 1 and ${MAX_ACTIVITY_LIMIT}`);
  }
  return value;
}

function cursorFor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseCursor(value: string | undefined): CursorValue | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorValue>;
    if (
      typeof decoded.occurredAt !== 'string'
      || typeof decoded.workspaceId !== 'string'
      || (decoded.source !== 'event' && decoded.source !== 'comment')
      || !Number.isSafeInteger(decoded.sourceId)
      || (decoded.sourceId ?? -1) < 0
    ) throw new Error('invalid');
    return decoded as CursorValue;
  } catch {
    throw new Error('Invalid runtime event cursor');
  }
}

function eventOrder(a: CursorValue, b: CursorValue): number {
  return a.occurredAt.localeCompare(b.occurredAt)
    || a.workspaceId.localeCompare(b.workspaceId)
    || a.source.localeCompare(b.source)
    || a.sourceId - b.sourceId;
}

export class HermesRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'hermes';
  private readonly home: string | undefined;
  private readonly now: () => Date;
  private readonly busyTimeoutMs: number;

  constructor(options: HermesRuntimeAdapterOptions = {}) {
    this.home = optionalHome(options);
    this.now = options.now ?? (() => new Date());
    this.busyTimeoutMs = options.busyTimeoutMs ?? 2000;
  }

  async describe(): Promise<RuntimeProvider> {
    const inspected = await this.inspectSources();
    const compatible = inspected.filter((source) => source.compatible).length;
    const unavailableMessage = this.home
      ? 'No canonical Hermes Kanban database was found'
      : 'Hermes home is not configured; set HERMES_HOME or pass hermesHome';
    const health = inspected.length === 0
      ? { state: 'unavailable' as const, checkedAt: nowIso(this.now), message: unavailableMessage }
      : compatible === 0
        ? { state: 'schema-incompatible' as const, checkedAt: nowIso(this.now), message: 'No discovered Hermes database has a supported schema' }
        : compatible < inspected.length
          ? { state: 'degraded' as const, checkedAt: nowIso(this.now), message: 'One or more Hermes databases are unavailable or schema-incompatible' }
          : { state: 'connected' as const, checkedAt: nowIso(this.now) };

    return RuntimeProviderSchema.parse({
      id: this.id,
      runtime: 'hermes',
      displayName: 'Hermes',
      health,
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        logs: { status: 'supported' },
        blockers: { status: 'supported' },
        approvals: { status: 'unsupported', reason: 'The supported Hermes Kanban schema has no canonical approval-request source' },
        pause: { status: 'unsupported', reason: 'The Hermes MVP adapter is read-only' },
        resume: { status: 'unsupported', reason: 'The Hermes MVP adapter is read-only' },
        cancellation: { status: 'unsupported', reason: 'The Hermes MVP adapter is read-only' },
        policyActions: { status: 'unsupported', reason: 'The Hermes MVP adapter is read-only' },
      },
      metadata: { discoveredWorkspaceCount: inspected.length },
    });
  }

  async getSnapshot(request: RuntimeSnapshotRequest = {}): Promise<RuntimeSnapshot> {
    const activityLimit = normalizeLimit(request.activityLimit);
    const inspected = (await this.inspectSources()).filter((source) => (
      request.workspaceId === undefined || source.workspaceId === request.workspaceId
    ));
    const workspaces: RuntimeWorkspace[] = inspected.map((source) => ({
      id: source.workspaceId,
      name: source.name,
      kind: source.kind,
      state: source.compatible ? 'available' as const : 'schema-incompatible' as const,
      ...(source.message ? { metadata: { diagnostic: boundedText(source.message) } } : {}),
    }));
    const tasks: RuntimeTask[] = [];
    const runs: RuntimeRun[] = [];
    const events: RuntimeEvent[] = [];
    const blockers: RuntimeBlocker[] = [];
    const agentsById = new Map<string, RuntimeAgent>();
    let queryFailures = 0;

    for (const source of inspected.filter((candidate) => candidate.compatible)) {
      try {
        const data = this.readSource(source, activityLimit);
        tasks.push(...data.tasks);
        runs.push(...data.runs);
        events.push(...data.events);
        blockers.push(...data.blockers);
        for (const agent of data.agents) agentsById.set(agent.id, agent);
      } catch {
        queryFailures += 1;
        const workspace = workspaces.find((candidate) => candidate.id === source.workspaceId);
        if (workspace) workspace.state = 'degraded';
      }
    }

    const compatibleCount = inspected.filter((source) => source.compatible).length;
    const state = inspected.length === 0
      ? (this.home ? 'empty' as const : 'unavailable' as const)
      : compatibleCount === 0
        ? 'schema-incompatible' as const
        : queryFailures > 0 || compatibleCount < inspected.length
          ? 'degraded' as const
          : tasks.length === 0 && runs.length === 0 && events.length === 0
            ? 'empty' as const
            : 'ready' as const;
    const message = state === 'unavailable'
      ? 'Hermes home is not configured'
      : state === 'schema-incompatible'
        ? 'No selected Hermes database has a supported schema'
        : state === 'degraded'
          ? 'Some Hermes workspaces could not be read consistently'
          : undefined;
    const dataStatus = state === 'unavailable' || state === 'schema-incompatible'
      ? { status: 'unsupported' as const, reason: message ?? 'Hermes data is unavailable' }
      : undefined;
    const workspaceStatus = state === 'unavailable'
      ? dataStatus
      : { status: 'available' as const, data: workspaces };

    return RuntimeSnapshotSchema.parse({
      providerId: this.id,
      state,
      capturedAt: nowIso(this.now),
      ...(message ? { message } : {}),
      workspaces: workspaceStatus,
      agents: dataStatus ?? { status: 'available', data: [...agentsById.values()].sort((a, b) => a.id.localeCompare(b.id)) },
      tasks: dataStatus ?? { status: 'available', data: tasks.sort((a, b) => a.id.localeCompare(b.id)) },
      runs: dataStatus ?? { status: 'available', data: runs.sort((a, b) => a.id.localeCompare(b.id)) },
      events: dataStatus ?? { status: 'available', data: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(-activityLimit) },
      blockers: dataStatus ?? { status: 'available', data: blockers.sort((a, b) => a.id.localeCompare(b.id)) },
      approvals: { status: 'unsupported', reason: 'The supported Hermes Kanban schema has no canonical approval-request source' },
    });
  }

  async getEvents(request: RuntimeEventRequest = {}): Promise<RuntimeEventPage> {
    const limit = normalizeLimit(request.limit);
    const after = parseCursor(request.cursor);
    const inspected = (await this.inspectSources()).filter((source) => (
      source.compatible && (request.workspaceId === undefined || source.workspaceId === request.workspaceId)
    ));
    const entries: Array<{ event: RuntimeEvent; cursor: CursorValue }> = [];
    for (const source of inspected) {
      for (const event of this.readEvents(source, after, limit + 1)) {
        const decoded = parseCursor(event.cursor);
        if (decoded) entries.push({ event, cursor: decoded });
      }
    }
    entries.sort((a, b) => eventOrder(a.cursor, b.cursor));
    const filtered = after ? entries.filter((entry) => eventOrder(entry.cursor, after) > 0) : entries;
    const page = after ? filtered.slice(0, limit) : filtered.slice(-limit);
    return RuntimeEventPageSchema.parse({
      events: page.map((entry) => entry.event),
      nextCursor: page.length > 0 ? page[page.length - 1]!.event.cursor : request.cursor ?? null,
    });
  }

  private async discoverSources(): Promise<DatabaseSource[]> {
    if (!this.home) return [];
    const home = resolve(this.home);
    const sources: DatabaseSource[] = [];
    const globalPath = resolve(home, 'kanban.db');
    if (await this.isSafeDatabase(home, globalPath)) {
      sources.push({ workspaceId: 'hermes:global', name: 'global', kind: 'workspace', path: globalPath });
    }
    const boardsRoot = resolve(home, 'kanban', 'boards');
    let entries;
    try {
      entries = await readdir(boardsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return sources;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !/^[A-Za-z0-9._-]+$/u.test(entry.name)) continue;
      const path = resolve(boardsRoot, entry.name, 'kanban.db');
      if (await this.isSafeDatabase(home, path)) {
        sources.push({ workspaceId: `hermes:${entry.name}`, name: entry.name, kind: 'board', path });
      }
    }
    return sources;
  }

  private async isSafeDatabase(home: string, path: string): Promise<boolean> {
    try {
      const [resolvedHome, resolvedPath, fileStat] = await Promise.all([realpath(home), realpath(path), stat(path)]);
      return fileStat.isFile() && (resolvedPath === resolvedHome || resolvedPath.startsWith(`${resolvedHome}${sep}`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async inspectSources(): Promise<InspectedSource[]> {
    const sources = await this.discoverSources();
    return sources.map((source) => {
      try {
        const db = this.open(source.path);
        try {
          const issue = this.schemaIssue(db);
          return issue ? { ...source, compatible: false, message: issue } : { ...source, compatible: true };
        } finally {
          db.close();
        }
      } catch (error) {
        return { ...source, compatible: false, message: error instanceof Error ? error.message : 'Database unavailable' };
      }
    });
  }

  private open(path: string): Database.Database {
    const db = new Database(path, { readonly: true, fileMustExist: true, timeout: this.busyTimeoutMs });
    db.pragma('query_only = ON');
    db.pragma(`busy_timeout = ${this.busyTimeoutMs}`);
    return db;
  }

  private schemaIssue(db: Database.Database): string | undefined {
    for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
      const columns = new Set(
        (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((column) => column.name),
      );
      if (columns.size === 0) return `Missing required table ${table}`;
      const missing = requiredColumns.filter((column) => !columns.has(column));
      if (missing.length > 0) return `Table ${table} is missing required columns: ${missing.join(', ')}`;
    }
    return undefined;
  }

  private hasTable(db: Database.Database, table: string): boolean {
    return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(table) !== undefined;
  }

  private readSource(source: DatabaseSource, activityLimit: number): {
    tasks: RuntimeTask[];
    runs: RuntimeRun[];
    events: RuntimeEvent[];
    blockers: RuntimeBlocker[];
    agents: RuntimeAgent[];
  } {
    const db = this.open(source.path);
    try {
      return db.transaction(() => {
        const taskRows = db.prepare('SELECT * FROM tasks ORDER BY created_at, id').all() as RuntimeRow[];
        const linkRows = this.hasTable(db, 'task_links')
          ? db.prepare('SELECT parent_id, child_id FROM task_links ORDER BY parent_id, child_id').all() as RuntimeRow[]
          : [];
        const runRows = db.prepare('SELECT * FROM task_runs ORDER BY started_at, id').all() as RuntimeRow[];
        const eventRows = db.prepare('SELECT * FROM task_events ORDER BY created_at DESC, id DESC LIMIT ?').all(activityLimit) as RuntimeRow[];
        const commentRows = this.hasTable(db, 'task_comments')
          ? db.prepare('SELECT id, task_id, author, body, created_at FROM task_comments ORDER BY created_at DESC, id DESC LIMIT ?').all(activityLimit) as RuntimeRow[]
          : [];
        return this.normalizeRows(source, taskRows, linkRows, runRows, eventRows, commentRows, activityLimit);
      }).deferred();
    } finally {
      db.close();
    }
  }

  private readEvents(source: DatabaseSource, after: CursorValue | undefined, limit: number): RuntimeEvent[] {
    const db = this.open(source.path);
    try {
      return db.transaction(() => {
        const eventRows = this.readActivityRows(db, 'task_events', 'event', source.workspaceId, after, limit);
        const commentRows = this.hasTable(db, 'task_comments')
          ? this.readActivityRows(db, 'task_comments', 'comment', source.workspaceId, after, limit)
          : [];
        return this.normalizeRows(source, [], [], [], eventRows, commentRows, limit * 2).events;
      }).deferred();
    } finally {
      db.close();
    }
  }

  private readActivityRows(
    db: Database.Database,
    table: 'task_events' | 'task_comments',
    activitySource: 'event' | 'comment',
    workspaceId: string,
    after: CursorValue | undefined,
    limit: number,
  ): RuntimeRow[] {
    if (!after) {
      return db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit) as RuntimeRow[];
    }

    const sample = db.prepare(`SELECT created_at FROM ${table} WHERE created_at IS NOT NULL LIMIT 1`).get() as RuntimeRow | undefined;
    const sampleTimestamp = sample?.['created_at'];
    const milliseconds = typeof sampleTimestamp === 'number' && Math.abs(sampleTimestamp) >= 100_000_000_000;
    const parsedAfter = Date.parse(after.occurredAt);
    const threshold = milliseconds ? parsedAfter : Math.floor(parsedAfter / 1000);
    const workspaceOrder = workspaceId.localeCompare(after.workspaceId);
    const sourceOrder = activitySource.localeCompare(after.source);

    if (workspaceOrder === 0 && sourceOrder === 0) {
      return db.prepare(`
        SELECT * FROM ${table}
        WHERE created_at > ? OR (created_at = ? AND id > ?)
        ORDER BY created_at, id
        LIMIT ?
      `).all(threshold, threshold, after.sourceId, limit) as RuntimeRow[];
    }
    const includeSameTimestamp = workspaceOrder > 0 || (workspaceOrder === 0 && sourceOrder > 0);
    return db.prepare(`
      SELECT * FROM ${table}
      WHERE created_at ${includeSameTimestamp ? '>=' : '>'} ?
      ORDER BY created_at, id
      LIMIT ?
    `).all(threshold, limit) as RuntimeRow[];
  }

  private normalizeRows(
    source: DatabaseSource,
    taskRows: RuntimeRow[],
    linkRows: RuntimeRow[],
    runRows: RuntimeRow[],
    eventRows: RuntimeRow[],
    commentRows: RuntimeRow[],
    activityLimit: number,
  ) {
    const dependencies = new Map<string, string[]>();
    for (const link of linkRows) {
      const child = String(link['child_id']);
      const parents = dependencies.get(child) ?? [];
      parents.push(taskId(source.workspaceId, link['parent_id']));
      dependencies.set(child, parents);
    }
    const tasks: RuntimeTask[] = taskRows.map((task) => {
      const rawId = String(task['id']);
      const owner = typeof task['assignee'] === 'string' && task['assignee'] ? [agentId(source.workspaceId, task['assignee'])] : [];
      const parents = dependencies.get(rawId) ?? [];
      const updatedAt = timestamp(task['last_heartbeat_at']) ?? timestamp(task['completed_at']) ?? timestamp(task['started_at']);
      return {
        id: taskId(source.workspaceId, rawId),
        workspaceId: source.workspaceId,
        title: boundedText(task['title']),
        state: mapTaskState(task['status']),
        parentIds: parents,
        dependencyIds: parents,
        ownerIds: owner,
        priority: typeof task['priority'] === 'number' && Number.isSafeInteger(task['priority']) ? task['priority'] : null,
        createdAt: requiredTimestamp(task['created_at']),
        updatedAt,
        metadata: { runtimeStatus: String(task['status']) },
      };
    });
    const sessionByRunId = new Map<string, string>();
    const activeRunIds = new Set<string>();
    for (const task of taskRows) {
      if (task['current_run_id'] == null) continue;
      const currentRunId = String(task['current_run_id']);
      activeRunIds.add(currentRunId);
      if (typeof task['session_id'] === 'string' && task['session_id']) {
        sessionByRunId.set(currentRunId, boundedText(task['session_id']));
      }
    }
    const runs: RuntimeRun[] = runRows.map((run) => {
      const rawTaskId = String(run['task_id']);
      const profile = typeof run['profile'] === 'string' && run['profile'] ? run['profile'] : null;
      return {
        id: `${source.workspaceId}:run:${String(run['id'])}`,
        workspaceId: source.workspaceId,
        taskId: taskId(source.workspaceId, rawTaskId),
        agentId: profile ? agentId(source.workspaceId, profile) : null,
        sessionId: sessionByRunId.get(String(run['id'])) ?? null,
        state: mapRunState(run['status'], run['outcome']),
        startedAt: requiredTimestamp(run['started_at']),
        finishedAt: timestamp(run['ended_at']),
        lastActiveAt: timestamp(run['last_heartbeat_at']) ?? timestamp(run['ended_at']) ?? timestamp(run['started_at']),
        summary: typeof run['summary'] === 'string' ? boundedText(run['summary']) : null,
        metadata: {
          runtimeStatus: String(run['status']),
          ...(typeof run['outcome'] === 'string' ? { outcome: run['outcome'] } : {}),
        },
      };
    });
    const agentInputs = new Map<string, { states: string[]; timestamps: string[] }>();
    for (const task of taskRows) {
      if (typeof task['assignee'] !== 'string' || !task['assignee']) continue;
      const current = agentInputs.get(task['assignee']) ?? { states: [], timestamps: [] };
      current.states.push(String(task['status']));
      const active = timestamp(task['last_heartbeat_at']) ?? timestamp(task['completed_at']) ?? timestamp(task['started_at']);
      if (active) current.timestamps.push(active);
      agentInputs.set(task['assignee'], current);
    }
    for (const run of runRows) {
      if (!activeRunIds.has(String(run['id']))) continue;
      if (typeof run['profile'] !== 'string' || !run['profile']) continue;
      const current = agentInputs.get(run['profile']) ?? { states: [], timestamps: [] };
      current.states.push(String(run['status']));
      const active = timestamp(run['last_heartbeat_at']) ?? timestamp(run['ended_at']) ?? timestamp(run['started_at']);
      if (active) current.timestamps.push(active);
      agentInputs.set(run['profile'], current);
    }
    const agents: RuntimeAgent[] = [...agentInputs.entries()].map(([name, value]) => ({
      id: agentId(source.workspaceId, name),
      workspaceId: source.workspaceId,
      displayName: boundedText(name),
      state: value.states.includes('running') ? 'running' : value.states.includes('blocked') ? 'blocked' : 'idle',
      lastActiveAt: value.timestamps.sort().at(-1) ?? null,
    }));
    const blockers: RuntimeBlocker[] = taskRows
      .filter((task) => task['status'] === 'blocked')
      .map((task) => ({
        id: `${source.workspaceId}:blocker:${String(task['id'])}`,
        workspaceId: source.workspaceId,
        taskId: taskId(source.workspaceId, task['id']),
        category: blockerCategory(task['block_kind']),
        summary: boundedText(task['result']) || 'Task is blocked',
        createdAt: timestamp(task['started_at']) ?? requiredTimestamp(task['created_at']),
        metadata: { runtimeStatus: 'blocked' },
      }));
    const normalizedEvents: RuntimeEvent[] = [];
    for (const event of eventRows) {
      const sourceId = Number(event['id']);
      const occurredAt = requiredTimestamp(event['created_at']);
      const cursor = cursorFor({ occurredAt, workspaceId: source.workspaceId, source: 'event', sourceId });
      normalizedEvents.push({
        id: `${source.workspaceId}:event:${sourceId}`,
        cursor,
        workspaceId: source.workspaceId,
        taskId: event['task_id'] === null ? null : taskId(source.workspaceId, event['task_id']),
        runId: event['run_id'] == null ? null : `${source.workspaceId}:run:${String(event['run_id'])}`,
        type: event['kind'] === 'blocked' ? 'blocker' : 'lifecycle',
        occurredAt,
        summary: `${boundedText(event['kind']) || 'unknown'} task event`,
        metadata: { source: 'task-event' },
      });
    }
    for (const comment of commentRows) {
      const sourceId = Number(comment['id']);
      const occurredAt = requiredTimestamp(comment['created_at']);
      const cursor = cursorFor({ occurredAt, workspaceId: source.workspaceId, source: 'comment', sourceId });
      normalizedEvents.push({
        id: `${source.workspaceId}:comment:${sourceId}`,
        cursor,
        workspaceId: source.workspaceId,
        taskId: taskId(source.workspaceId, comment['task_id']),
        runId: null,
        type: 'comment',
        occurredAt,
        summary: boundedText(comment['body']),
        metadata: { source: 'task-comment', author: boundedText(comment['author']) },
      });
    }
    normalizedEvents.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    return { tasks, runs, events: normalizedEvents.slice(-activityLimit), blockers, agents };
  }
}
