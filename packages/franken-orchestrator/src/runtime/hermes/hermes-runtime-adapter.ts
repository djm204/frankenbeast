import { readdir, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { redactSensitiveText } from '../../logging/redaction.js';
import {
  RuntimeCursorError,
  type RuntimeAdapter,
  type RuntimeEventRequest,
  type RuntimeSnapshotRequest,
} from '../runtime-adapter.js';
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
  kanbanDbPath?: string | undefined;
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
  status: 'compatible' | 'schema-incompatible' | 'unavailable';
  message?: string | undefined;
}

interface SourceInspection {
  sources: InspectedSource[];
  discoveryMessage?: string | undefined;
}

type RuntimeRow = Record<string, unknown>;

interface CursorValue {
  occurredAt: string;
  workspaceId: string;
  source: 'event' | 'comment';
  sourceId: number;
}

interface CursorPosition extends CursorValue {
  missingPolls?: number | undefined;
}

interface RequestCursorState {
  legacy?: CursorValue | undefined;
  positions: Map<string, CursorPosition>;
}

const REQUIRED_SCHEMA: Record<string, string[]> = {
  tasks: ['id', 'title', 'status', 'created_at', 'workspace_kind'],
  task_runs: ['id', 'task_id', 'status', 'started_at'],
  task_events: ['id', 'task_id', 'kind', 'created_at'],
};
const DEFAULT_ACTIVITY_LIMIT = 100;
const MAX_ACTIVITY_LIMIT = 500;
const MAX_CURSOR_CHARS = 12 * 1024;
const MAX_SUMMARY_CHARS = 512;
const MISSING_WORKSPACE_GRACE_POLLS = 1;
const ABSOLUTE_PATH_RE = /(^|[\s=:\[({,;|!?])(\/(?:home|Users|private|var|tmp|srv|opt|etc|root|mnt|workspace|workspaces)\/(?:[^\s"']+\/?)+|[A-Za-z]:[\\/](?:[^\s"']+)|\\\\(?:[^\s"']+))/gu;
const POSIX_PATH_RE = /(^|[\s=:\[({,;|!?])(\/(?:[^/\s"']+\/)+[^\s"']+)/gu;
const QUOTED_POSIX_PATH_RE = /(['"])(\/(?:[^/'"\s]+\/)+[^'"\s]+)(?=\1)/gu;
const API_ROUTE_RE = /^\/(?:api|v\d+|comms|webhooks)(?:\/|$)/u;

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

function optionalHome(options: HermesRuntimeAdapterOptions): string | undefined {
  const env = options.env ?? process.env;
  const value = options.hermesHome ?? env['HERMES_HOME']
    ?? (env['HOME'] ? resolve(env['HOME'], '.hermes') : undefined);
  return value?.trim() || undefined;
}

function optionalKanbanDbPath(options: HermesRuntimeAdapterOptions): string | undefined {
  const env = options.env ?? process.env;
  const value = options.kanbanDbPath ?? env['HERMES_KANBAN_DB'];
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

function latestTimestamp(...values: unknown[]): string | null {
  const normalized = values.map(timestamp).filter((value): value is string => value !== null);
  return normalized.sort().at(-1) ?? null;
}

function boundedText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const redacted = redactSensitiveText(value)
    .replace(ABSOLUTE_PATH_RE, (_match, prefix: string) => `${prefix}[REDACTED_HOST_PATH]`)
    .replace(POSIX_PATH_RE, (_match, prefix: string, path: string) => (
      API_ROUTE_RE.test(path) ? `${prefix}${path}` : `${prefix}[REDACTED_HOST_PATH]`
    ))
    .replace(QUOTED_POSIX_PATH_RE, (_match, quote: string, path: string) => (
      API_ROUTE_RE.test(path) ? `${quote}${path}` : `${quote}[REDACTED_HOST_PATH]`
    ));
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
    case 'completed':
    case 'complete':
    case 'success': return 'succeeded';
    case 'failed':
    case 'gave_up':
    case 'crashed':
    case 'timed_out':
    case 'timeout':
    case 'error':
    case 'spawn_failed': return 'failed';
    case 'cancelled':
    case 'canceled':
    case 'stopped': return 'cancelled';
    case 'archived':
    case 'deleted': return 'archived';
    default: return 'unknown';
  }
}

function isTerminalTaskStatus(status: unknown): boolean {
  return ['succeeded', 'failed', 'cancelled', 'archived'].includes(mapTaskState(status));
}

function mapRunState(status: unknown, outcome: unknown): 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'unknown' {
  const value = outcome ?? status;
  switch (value) {
    case 'scheduled':
    case 'pending':
    case 'ready': return 'queued';
    case 'running': return 'running';
    case 'blocked': return 'blocked';
    case 'done':
    case 'completed':
    case 'complete':
    case 'success': return 'succeeded';
    case 'cancelled':
    case 'canceled': return 'cancelled';
    case 'crashed':
    case 'failed':
    case 'gave_up':
    case 'timed_out':
    case 'timeout':
    case 'error':
    case 'spawn_failed': return 'failed';
    default: return 'unknown';
  }
}

function blockerCategory(value: unknown): 'dependency' | 'needs-input' | 'capability' | 'transient' | 'unknown' {
  switch (value) {
    case 'dependency': return 'dependency';
    case 'needs_input': return 'needs-input';
    case 'approval':
    case 'hitl':
    case 'human_approval': return 'needs-input';
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
      || Number.isNaN(Date.parse(decoded.occurredAt))
      || new Date(Date.parse(decoded.occurredAt)).toISOString() !== decoded.occurredAt
      || typeof decoded.workspaceId !== 'string'
      || (decoded.source !== 'event' && decoded.source !== 'comment')
      || !Number.isSafeInteger(decoded.sourceId)
      || (decoded.sourceId ?? -1) < 0
    ) throw new Error('invalid');
    return decoded as CursorValue;
  } catch {
    throw new RuntimeCursorError();
  }
}

function parseRequestCursor(value: string | undefined): RequestCursorState {
  if (!value) return { positions: new Map() };
  if (value.length > MAX_CURSOR_CHARS) throw new RuntimeCursorError();
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      p?: unknown;
      positions?: unknown;
    };
    if (Array.isArray(decoded.p)) {
      const positions = new Map<string, CursorPosition>();
      for (const entry of decoded.p) {
        if (!Array.isArray(entry) || (entry.length !== 4 && entry.length !== 5)) throw new Error('invalid');
        const [workspaceId, occurredAt, sourceCode, sourceId, missingPolls = 0] = entry as unknown[];
        const source = sourceCode === 0 ? 'event' : sourceCode === 1 ? 'comment' : undefined;
        if (
          typeof workspaceId !== 'string'
          || typeof occurredAt !== 'string'
          || Number.isNaN(Date.parse(occurredAt))
          || new Date(Date.parse(occurredAt)).toISOString() !== occurredAt
          || source === undefined
          || !Number.isSafeInteger(sourceId)
          || (sourceId as number) < 0
          || !Number.isSafeInteger(missingPolls)
          || (missingPolls as number) < 0
          || (missingPolls as number) > MISSING_WORKSPACE_GRACE_POLLS
        ) throw new Error('invalid');
        positions.set(workspaceId, {
          workspaceId,
          occurredAt,
          source,
          sourceId: sourceId as number,
          ...((missingPolls as number) > 0 ? { missingPolls: missingPolls as number } : {}),
        });
      }
      return { positions };
    }
    if (decoded.positions && typeof decoded.positions === 'object' && !Array.isArray(decoded.positions)) {
      const positions = new Map<string, CursorPosition>();
      for (const [workspaceId, encoded] of Object.entries(decoded.positions)) {
        if (typeof encoded !== 'string') throw new Error('invalid');
        const cursor = parseCursor(encoded);
        if (!cursor || cursor.workspaceId !== workspaceId) throw new Error('invalid');
        positions.set(workspaceId, cursor);
      }
      return { positions };
    }
  } catch (error) {
    if (error instanceof RuntimeCursorError) throw error;
    throw new RuntimeCursorError();
  }
  return { legacy: parseCursor(value), positions: new Map() };
}

function cursorForPositions(positions: Map<string, CursorPosition>): string {
  const cursor = Buffer.from(JSON.stringify({
    p: [...positions].map(([workspaceId, cursor]) => [
      workspaceId,
      cursor.occurredAt,
      cursor.source === 'event' ? 0 : 1,
      cursor.sourceId,
      ...(cursor.missingPolls ? [cursor.missingPolls] : []),
    ]),
  })).toString('base64url');
  if (cursor.length > MAX_CURSOR_CHARS) {
    throw new RangeError('Hermes workspace set exceeds the supported runtime cursor size');
  }
  return cursor;
}

function eventOrder(a: CursorValue, b: CursorValue): number {
  return a.occurredAt.localeCompare(b.occurredAt)
    || a.workspaceId.localeCompare(b.workspaceId)
    || a.source.localeCompare(b.source)
    || a.sourceId - b.sourceId;
}

function runtimeEventOrder(a: RuntimeEvent, b: RuntimeEvent): number {
  const left = parseCursor(a.cursor);
  const right = parseCursor(b.cursor);
  return left && right ? eventOrder(left, right) : a.id.localeCompare(b.id);
}

export class HermesRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'hermes';
  private readonly home: string | undefined;
  private readonly kanbanDbPath: string | undefined;
  private readonly now: () => Date;
  private readonly busyTimeoutMs: number;

  constructor(options: HermesRuntimeAdapterOptions = {}) {
    this.home = optionalHome(options);
    this.kanbanDbPath = optionalKanbanDbPath(options);
    this.now = options.now ?? (() => new Date());
    this.busyTimeoutMs = options.busyTimeoutMs ?? 2000;
  }

  async describe(): Promise<RuntimeProvider> {
    const inspection = await this.inspectSources();
    const inspected = inspection.sources;
    const compatible = inspected.filter((source) => source.status === 'compatible').length;
    const unavailable = inspected.filter((source) => source.status === 'unavailable').length;
    const incompatible = inspected.filter((source) => source.status === 'schema-incompatible').length;
    const unavailableMessage = this.home || this.kanbanDbPath
      ? 'No canonical Hermes Kanban database was found'
      : 'Hermes home is not configured; set HERMES_HOME or pass hermesHome';
    const health = inspected.length === 0
      ? {
          state: 'unavailable' as const,
          checkedAt: nowIso(this.now),
          message: inspection.discoveryMessage ? boundedText(inspection.discoveryMessage) : unavailableMessage,
        }
      : compatible === 0 && unavailable > 0
        ? { state: 'unavailable' as const, checkedAt: nowIso(this.now), message: 'Discovered Hermes databases are unavailable' }
        : compatible === 0 && incompatible === inspected.length
          ? { state: 'schema-incompatible' as const, checkedAt: nowIso(this.now), message: 'No discovered Hermes database has a supported schema' }
        : inspection.discoveryMessage || compatible < inspected.length
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
        logs: { status: 'unsupported', reason: 'The supported Hermes Kanban schema has no canonical log-record source' },
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
    throwIfAborted(request.signal);
    const activityLimit = normalizeLimit(request.activityLimit);
    const inspection = await this.inspectSources(request.signal);
    throwIfAborted(request.signal);
    const inspected = inspection.sources.filter((source) => (
      request.workspaceId === undefined || source.workspaceId === request.workspaceId
    ));
    const workspaces: RuntimeWorkspace[] = inspected.map((source) => ({
      id: source.workspaceId,
      name: source.name,
      kind: source.kind,
      state: source.status === 'compatible' ? 'available' as const : source.status,
      ...(source.message ? { metadata: { diagnostic: boundedText(source.message) } } : {}),
    }));
    const tasks: RuntimeTask[] = [];
    const runs: RuntimeRun[] = [];
    const events: RuntimeEvent[] = [];
    const blockers: RuntimeBlocker[] = [];
    const agentsById = new Map<string, RuntimeAgent>();
    let queryFailures = 0;

    for (const source of inspected.filter((candidate) => candidate.status === 'compatible')) {
      throwIfAborted(request.signal);
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

    const compatibleCount = inspected.filter((source) => source.status === 'compatible').length;
    const unavailableCount = inspected.filter((source) => source.status === 'unavailable').length;
    const incompatibleCount = inspected.filter((source) => source.status === 'schema-incompatible').length;
    const workspaceFilterMiss = request.workspaceId !== undefined
      && inspected.length === 0
      && inspection.discoveryMessage === undefined;
    const state = workspaceFilterMiss
      ? 'empty' as const
      : inspected.length === 0
      ? 'unavailable' as const
      : compatibleCount === 0 && unavailableCount > 0
        ? 'unavailable' as const
        : compatibleCount === 0 && incompatibleCount === inspected.length
          ? 'schema-incompatible' as const
        : inspection.discoveryMessage || queryFailures > 0 || compatibleCount < inspected.length
          ? 'degraded' as const
          : tasks.length === 0 && runs.length === 0 && events.length === 0
            ? 'empty' as const
            : 'ready' as const;
    const message = state === 'unavailable'
      ? (inspection.discoveryMessage
          ? boundedText(inspection.discoveryMessage)
          : this.home || this.kanbanDbPath
            ? 'Discovered Hermes databases are unavailable'
            : 'Hermes home is not configured')
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
      events: dataStatus ?? { status: 'available', data: events.sort(runtimeEventOrder).slice(-activityLimit) },
      blockers: dataStatus ?? { status: 'available', data: blockers.sort((a, b) => a.id.localeCompare(b.id)) },
      approvals: { status: 'unsupported', reason: 'The supported Hermes Kanban schema has no canonical approval-request source' },
    });
  }

  async getEvents(request: RuntimeEventRequest = {}): Promise<RuntimeEventPage> {
    throwIfAborted(request.signal);
    const limit = normalizeLimit(request.limit);
    const cursorState = parseRequestCursor(request.cursor);
    const selectedSources = (await this.inspectSources(request.signal)).sources.filter((source) => (
      request.workspaceId === undefined || source.workspaceId === request.workspaceId
    ));
    throwIfAborted(request.signal);
    const inspected = selectedSources.filter((source) => source.status === 'compatible');
    const entries: Array<{ event: RuntimeEvent; cursor: CursorValue }> = [];
    const sourceLatest = new Map<string, CursorValue>();
    for (const source of inspected) {
      throwIfAborted(request.signal);
      const after = cursorState.positions.get(source.workspaceId) ?? cursorState.legacy;
      try {
        const events = this.readEvents(source, after, limit + 1);
        for (const event of events) {
          const decoded = parseCursor(event.cursor);
          if (decoded) entries.push({ event, cursor: decoded });
        }
        const latest = events.at(-1);
        const latestCursor = latest ? parseCursor(latest.cursor) : undefined;
        if (latestCursor) sourceLatest.set(source.workspaceId, latestCursor);
      } catch {
        // Preserve healthy workspace activity across transient or corrupt sibling sources.
      }
    }
    entries.sort((a, b) => eventOrder(a.cursor, b.cursor));
    const filtered = entries.filter((entry) => {
      const after = cursorState.positions.get(entry.cursor.workspaceId) ?? cursorState.legacy;
      return !after || eventOrder(entry.cursor, after) > 0;
    });
    const page = request.cursor ? filtered.slice(0, limit) : filtered.slice(-limit);
    const selectedWorkspaceIds = new Set(selectedSources.map((source) => source.workspaceId));
    const positions = new Map<string, CursorPosition>();
    for (const [workspaceId, position] of cursorState.positions) {
      if (selectedWorkspaceIds.has(workspaceId)) {
        positions.set(workspaceId, { ...position, missingPolls: undefined });
      } else if (
        request.workspaceId === undefined
        && (position.missingPolls ?? 0) < MISSING_WORKSPACE_GRACE_POLLS
      ) {
        positions.set(workspaceId, { ...position, missingPolls: (position.missingPolls ?? 0) + 1 });
      }
    }
    if (cursorState.legacy) {
      for (const source of inspected) positions.set(source.workspaceId, cursorState.legacy);
    }
    if (!request.cursor) {
      const pageWorkspaces = new Set(page.map((entry) => entry.cursor.workspaceId));
      for (const [workspaceId, latest] of sourceLatest) {
        if (!pageWorkspaces.has(workspaceId)) positions.set(workspaceId, latest);
      }
      for (const workspaceId of pageWorkspaces) {
        const firstPageEntry = page.find((entry) => entry.cursor.workspaceId === workspaceId);
        const predecessor = firstPageEntry
          ? filtered.filter((entry) => (
              entry.cursor.workspaceId === workspaceId
              && eventOrder(entry.cursor, firstPageEntry.cursor) < 0
            )).at(-1)
          : undefined;
        if (predecessor) positions.set(workspaceId, predecessor.cursor);
      }
    }
    const events = page.map((entry) => {
      positions.set(entry.cursor.workspaceId, entry.cursor);
      return { ...entry.event, cursor: cursorForPositions(positions) };
    });
    return RuntimeEventPageSchema.parse({
      events,
      nextCursor: events.at(-1)?.cursor ?? (request.cursor ? cursorForPositions(positions) : null),
    });
  }

  validateEventCursor(cursor: string): void {
    parseRequestCursor(cursor);
  }

  private async discoverSources(signal?: AbortSignal): Promise<{ sources: DatabaseSource[]; discoveryMessage?: string | undefined }> {
    throwIfAborted(signal);
    if (!this.home && !this.kanbanDbPath) return { sources: [] };
    const home = this.home ? resolve(this.home) : undefined;
    const sources: DatabaseSource[] = [];
    const discoveredPaths = new Set<string>();
    let discoveryMessage: string | undefined;
    const globalPath = this.kanbanDbPath ? resolve(this.kanbanDbPath) : resolve(home!, 'kanban.db');
    try {
      throwIfAborted(signal);
      const safe = this.kanbanDbPath
        ? await this.isDatabase(globalPath)
        : await this.isSafeDatabase(home!, globalPath);
      throwIfAborted(signal);
      if (safe) {
        const resolvedPath = await realpath(globalPath);
        throwIfAborted(signal);
        discoveredPaths.add(resolvedPath);
        sources.push({ workspaceId: 'hermes:global', name: 'global', kind: 'workspace', path: resolvedPath });
      }
    } catch (error) {
      throwIfAborted(signal);
      discoveryMessage = error instanceof Error ? error.message : 'Hermes database discovery failed';
    }
    if (!home) return { sources, ...(discoveryMessage ? { discoveryMessage } : {}) };
    const boardsRoot = resolve(home, 'kanban', 'boards');
    let entries;
    try {
      throwIfAborted(signal);
      entries = await readdir(boardsRoot, { withFileTypes: true });
      throwIfAborted(signal);
    } catch (error) {
      throwIfAborted(signal);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        discoveryMessage = error instanceof Error ? error.message : 'Hermes board discovery failed';
      }
      return { sources, ...(discoveryMessage ? { discoveryMessage } : {}) };
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      throwIfAborted(signal);
      if (!entry.isDirectory() || !/^[A-Za-z0-9._-]+$/u.test(entry.name)) continue;
      const path = resolve(boardsRoot, entry.name, 'kanban.db');
      try {
        if (await this.isSafeDatabase(home, path)) {
          throwIfAborted(signal);
          const resolvedPath = await realpath(path);
          throwIfAborted(signal);
          if (discoveredPaths.has(resolvedPath)) continue;
          discoveredPaths.add(resolvedPath);
          const workspaceId = entry.name === 'global' ? 'hermes:board:global' : `hermes:${entry.name}`;
          sources.push({ workspaceId, name: entry.name, kind: 'board', path: resolvedPath });
        }
      } catch (error) {
        throwIfAborted(signal);
        discoveryMessage ??= error instanceof Error ? error.message : 'Hermes board discovery failed';
      }
    }
    return { sources, ...(discoveryMessage ? { discoveryMessage } : {}) };
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

  private async isDatabase(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async inspectSources(signal?: AbortSignal): Promise<SourceInspection> {
    const discovery = await this.discoverSources(signal);
    const sources: InspectedSource[] = [];
    for (const source of discovery.sources) {
      throwIfAborted(signal);
      try {
        const db = this.open(source.path);
        try {
          const issue = this.schemaIssue(db);
          sources.push(issue
            ? { ...source, status: 'schema-incompatible' as const, message: issue }
            : { ...source, status: 'compatible' as const });
        } finally {
          db.close();
        }
      } catch (error) {
        sources.push({
          ...source,
          status: 'unavailable' as const,
          message: error instanceof Error ? error.message : 'Database unavailable',
        });
      }
    }
    return { sources, ...(discovery.discoveryMessage ? { discoveryMessage: discovery.discoveryMessage } : {}) };
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

  private hasColumns(db: Database.Database, table: string, requiredColumns: string[]): boolean {
    if (!this.hasTable(db, table)) return false;
    const columns = new Set(
      (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    return requiredColumns.every((column) => columns.has(column));
  }

  private commentTable(db: Database.Database): 'comments' | 'task_comments' | undefined {
    if (this.hasColumns(db, 'comments', ['id', 'task_id', 'body', 'created_at'])) return 'comments';
    if (this.hasColumns(db, 'task_comments', ['id', 'task_id', 'author', 'body', 'created_at'])) {
      return 'task_comments';
    }
    return undefined;
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
        const commentTable = this.commentTable(db);
        const taskRows = db.prepare('SELECT * FROM tasks ORDER BY created_at, id').all() as RuntimeRow[];
        const linkRows = this.hasTable(db, 'task_links')
          ? db.prepare('SELECT parent_id, child_id FROM task_links ORDER BY parent_id, child_id').all() as RuntimeRow[]
          : [];
        const runRows = db.prepare('SELECT * FROM task_runs ORDER BY started_at, id').all() as RuntimeRow[];
        const eventRows = db.prepare('SELECT * FROM task_events ORDER BY created_at DESC, id DESC LIMIT ?').all(activityLimit) as RuntimeRow[];
        const blockerEventRows = db.prepare(`
          SELECT event.*
          FROM task_events event
          JOIN tasks task ON task.id = event.task_id
          WHERE task.status = 'blocked'
            AND event.kind = 'blocked'
            AND event.id = (
              SELECT latest.id
              FROM task_events latest
              WHERE latest.task_id = event.task_id AND latest.kind = 'blocked'
              ORDER BY latest.created_at DESC, latest.id DESC
              LIMIT 1
            )
        `).all() as RuntimeRow[];
        const commentRows = commentTable === 'comments'
          ? db.prepare('SELECT id, task_id, NULL AS author, body, created_at FROM comments ORDER BY created_at DESC, id DESC LIMIT ?').all(activityLimit) as RuntimeRow[]
          : commentTable === 'task_comments'
            ? db.prepare('SELECT id, task_id, author, body, created_at FROM task_comments ORDER BY created_at DESC, id DESC LIMIT ?').all(activityLimit) as RuntimeRow[]
            : [];
        return this.normalizeRows(
          source, taskRows, linkRows, runRows, eventRows, commentRows, activityLimit, blockerEventRows,
        );
      }).deferred();
    } finally {
      db.close();
    }
  }

  private readEvents(source: DatabaseSource, after: CursorValue | undefined, limit: number): RuntimeEvent[] {
    const db = this.open(source.path);
    try {
      return db.transaction(() => {
        const commentTable = this.commentTable(db);
        const eventRows = this.readActivityRows(db, 'task_events', 'event', source.workspaceId, after, limit);
        const commentRows = commentTable === 'comments'
          ? this.readActivityRows(db, 'comments', 'comment', source.workspaceId, after, limit)
          : commentTable === 'task_comments'
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
    table: 'task_events' | 'comments' | 'task_comments',
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
    blockerEventRows: RuntimeRow[] = eventRows,
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
      const updatedAt = latestTimestamp(task['last_heartbeat_at'], task['completed_at'], task['started_at']);
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
      if (!isTerminalTaskStatus(task['status'])) activeRunIds.add(currentRunId);
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
        lastActiveAt: latestTimestamp(run['last_heartbeat_at'], run['ended_at'], run['started_at']),
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
      const active = latestTimestamp(task['last_heartbeat_at'], task['completed_at'], task['started_at']);
      if (active) current.timestamps.push(active);
      agentInputs.set(task['assignee'], current);
    }
    for (const run of runRows) {
      if (!activeRunIds.has(String(run['id']))) continue;
      if (typeof run['profile'] !== 'string' || !run['profile']) continue;
      const current = agentInputs.get(run['profile']) ?? { states: [], timestamps: [] };
      current.states.push(String(run['status']));
      const active = latestTimestamp(run['last_heartbeat_at'], run['ended_at'], run['started_at']);
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
    const blockedAtByTask = new Map<string, string>();
    for (const event of blockerEventRows) {
      if (event['kind'] !== 'blocked' || event['task_id'] == null) continue;
      const taskKey = String(event['task_id']);
      const occurredAt = requiredTimestamp(event['created_at']);
      if (occurredAt > (blockedAtByTask.get(taskKey) ?? '')) blockedAtByTask.set(taskKey, occurredAt);
    }
    const blockers: RuntimeBlocker[] = taskRows
      .filter((task) => task['status'] === 'blocked')
      .map((task) => ({
        id: `${source.workspaceId}:blocker:${String(task['id'])}`,
        workspaceId: source.workspaceId,
        taskId: taskId(source.workspaceId, task['id']),
        category: blockerCategory(task['block_kind']),
        summary: boundedText(task['result']) || 'Task is blocked',
        createdAt: blockedAtByTask.get(String(task['id']))
          ?? timestamp(task['started_at'])
          ?? requiredTimestamp(task['created_at']),
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
    normalizedEvents.sort(runtimeEventOrder);
    return { tasks, runs, events: normalizedEvents.slice(-activityLimit), blockers, agents };
  }
}
