import { createHash } from 'node:crypto';
import {
  RuntimeEventPageSchema,
  RuntimeSnapshotSchema,
  RuntimeProviderSchema,
  type RuntimeEventPage,
  type RuntimeProvider,
  type RuntimeAgent,
  type RuntimeEvent,
  type RuntimeSnapshot,
  type RuntimeWorkspace,
} from '../runtime-schemas.js';
import {
  RuntimeCursorError,
  type RuntimeAdapter,
  type RuntimeEventRequest,
  type RuntimeSnapshotRequest,
} from '../runtime-adapter.js';
import { createCodexAppServerRequest } from './codex-app-server-client.js';

export interface CodexAppServerRequestOptions {
  signal?: AbortSignal | undefined;
  timeoutMs: number;
}

export type CodexAppServerRequest = (
  method: string,
  params: Record<string, unknown>,
  options: CodexAppServerRequestOptions,
) => Promise<unknown>;

export interface CodexRuntimeAdapterOptions {
  request?: CodexAppServerRequest | undefined;
  command?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  now?: (() => Date) | undefined;
  requestTimeoutMs?: number | undefined;
}

const READ_ONLY_REASON = 'The Codex adapter is read-only';
const UNSUPPORTED_LOGS = 'Codex thread metadata does not expose bounded canonical logs';
const UNSUPPORTED_BLOCKERS = 'Codex thread metadata has no canonical blocker topology';
const UNSUPPORTED_APPROVALS = 'The Codex adapter does not observe durable approval state';
const UNSUPPORTED_TASKS = 'Codex threads do not expose a canonical task graph';
const UNSUPPORTED_RUNS = 'Codex thread metadata does not expose canonical task-linked runs';
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_ACTIVITY_LIMIT = 100;
const MAX_ACTIVITY_LIMIT = 500;
const MAX_THREAD_PAGES = 100;
const THREAD_STATUS_TYPES = new Set(['active', 'idle', 'notLoaded', 'systemError']);
const THREAD_SOURCE_KINDS = [
  'cli', 'vscode', 'exec', 'appServer', 'subAgent',
  'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown',
] as const;

interface CodexThread {
  id: string;
  sessionId: string;
  cliVersion: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  ephemeral: boolean;
  modelProvider: string;
  status: { type: string; activeFlags?: string[] | undefined };
}

class CodexSchemaError extends Error {}

function isProtocolSchemaError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'CodexProtocolError') return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === -32601 || code === -32602;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_ACTIVITY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ACTIVITY_LIMIT) {
    throw new RangeError(`activity limit must be an integer between 1 and ${MAX_ACTIVITY_LIMIT}`);
  }
  return value;
}

function timestamp(value: number): string | null {
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function parseThread(value: unknown): CodexThread | null {
  if (!value || typeof value !== 'object') return null;
  const thread = value as Record<string, unknown>;
  if (
    typeof thread['id'] !== 'string'
    || typeof thread['sessionId'] !== 'string'
    || typeof thread['cliVersion'] !== 'string'
    || typeof thread['createdAt'] !== 'number'
    || typeof thread['updatedAt'] !== 'number'
    || !timestamp(thread['createdAt'])
    || !timestamp(thread['updatedAt'])
    || typeof thread['cwd'] !== 'string'
    || typeof thread['ephemeral'] !== 'boolean'
    || typeof thread['modelProvider'] !== 'string'
    || !thread['status']
    || typeof thread['status'] !== 'object'
    || typeof (thread['status'] as Record<string, unknown>)['type'] !== 'string'
    || !THREAD_STATUS_TYPES.has((thread['status'] as Record<string, unknown>)['type'] as string)
    || (
      (thread['status'] as Record<string, unknown>)['activeFlags'] !== undefined
      && (
        !Array.isArray((thread['status'] as Record<string, unknown>)['activeFlags'])
        || ((thread['status'] as Record<string, unknown>)['activeFlags'] as unknown[])
          .some((flag) => typeof flag !== 'string')
      )
    )
  ) return null;
  return thread as unknown as CodexThread;
}

interface CodexThreadPage {
  threads: CodexThread[];
  rejected: number;
  nextCursor: string | null;
}

function parseThreadList(value: unknown): CodexThreadPage {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>)['data'])) {
    throw new CodexSchemaError('Codex app-server returned an incompatible thread/list response');
  }
  const record = value as { data: unknown[]; nextCursor?: unknown };
  if (record.nextCursor !== undefined && record.nextCursor !== null && typeof record.nextCursor !== 'string') {
    throw new CodexSchemaError('Codex app-server returned an incompatible thread/list cursor');
  }
  const values = record.data;
  const threads = values.map(parseThread).filter((thread): thread is CodexThread => thread !== null);
  return {
    threads,
    rejected: values.length - threads.length,
    nextCursor: typeof record.nextCursor === 'string' ? record.nextCursor : null,
  };
}

function workspaceKey(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}

function workspaceId(cwd: string): string {
  return `codex:workspace:${workspaceKey(cwd)}`;
}

function agentState(status: CodexThread['status']): RuntimeAgent['state'] {
  switch (status.type) {
    case 'active': return status.activeFlags?.some((flag) => (
      flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'
    )) ? 'blocked' : 'running';
    case 'idle': return 'idle';
    case 'notLoaded': return 'offline';
    case 'systemError': return 'blocked';
    default: return 'unknown';
  }
}

function eventCursor(thread: CodexThread, boundaryStatuses?: Record<string, string>): string {
  return Buffer.from(JSON.stringify({
    occurredAt: timestamp(thread.updatedAt),
    threadId: thread.id,
    status: thread.status.type,
    ...(boundaryStatuses ? { boundaryStatuses } : {}),
  })).toString('base64url');
}

interface CodexCursor {
  occurredAt: string;
  threadId: string;
  status?: string | undefined;
  boundaryStatuses?: Record<string, string> | undefined;
}

function parseCursor(value: string | undefined): CodexCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const boundaryStatuses = decoded['boundaryStatuses'];
    if (
      typeof decoded['occurredAt'] !== 'string'
      || Number.isNaN(Date.parse(decoded.occurredAt))
      || new Date(decoded.occurredAt).toISOString() !== decoded.occurredAt
      || typeof decoded.threadId !== 'string'
      || decoded.threadId.length === 0
      || (decoded.status !== undefined && (typeof decoded.status !== 'string' || decoded.status.length === 0))
      || (boundaryStatuses !== undefined && (
        boundaryStatuses === null
        || typeof boundaryStatuses !== 'object'
        || Array.isArray(boundaryStatuses)
        || Object.entries(boundaryStatuses).length > MAX_ACTIVITY_LIMIT
        || Object.entries(boundaryStatuses).some(([id, status]) => id.length === 0 || typeof status !== 'string' || status.length === 0)
      ))
    ) throw new Error('invalid');
    return {
      occurredAt: decoded['occurredAt'] as string,
      threadId: decoded['threadId'] as string,
      ...(decoded['status'] !== undefined ? { status: decoded['status'] as string } : {}),
      ...(boundaryStatuses !== undefined
        ? { boundaryStatuses: boundaryStatuses as Record<string, string> }
        : {}),
    };
  } catch {
    throw new RuntimeCursorError();
  }
}

function compareCursor(a: CodexCursor, b: CodexCursor): number {
  return a.occurredAt.localeCompare(b.occurredAt) || a.threadId.localeCompare(b.threadId);
}

function rememberStatus(statuses: Record<string, string>, threadId: string, status: string): void {
  if (!Object.hasOwn(statuses, threadId) && Object.keys(statuses).length >= MAX_ACTIVITY_LIMIT) {
    const oldestThreadId = Object.keys(statuses)[0];
    if (oldestThreadId !== undefined) delete statuses[oldestThreadId];
  }
  statuses[threadId] = status;
}

function eventForThread(thread: CodexThread, boundaryStatuses?: Record<string, string>): RuntimeEvent {
  return {
    id: `codex:thread:${thread.id}:${thread.updatedAt}:${thread.status.type}`,
    cursor: eventCursor(thread, boundaryStatuses),
    workspaceId: workspaceId(thread.cwd),
    taskId: null,
    runId: null,
    type: 'lifecycle',
    occurredAt: timestamp(thread.updatedAt)!,
    summary: `Codex thread is ${thread.status.type}`,
    metadata: { agentId: `codex:thread:${thread.id}`, sessionId: thread.sessionId },
  };
}

export class CodexRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'codex';
  private readonly request: CodexAppServerRequest;
  private readonly now: () => Date;
  private readonly requestTimeoutMs: number;

  constructor(options: CodexRuntimeAdapterOptions = {}) {
    this.request = options.request ?? createCodexAppServerRequest({
      command: options.command,
      env: options.env,
    });
    this.now = options.now ?? (() => new Date());
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  validateEventCursor(cursor: string): void {
    parseCursor(cursor);
  }

  private async readThreadPages(options: {
    pageSize: number;
    signal?: AbortSignal | undefined;
    stop: (threads: CodexThread[]) => boolean;
  }): Promise<{ threads: CodexThread[]; rejected: number; truncated: boolean }> {
    const threads: CodexThread[] = [];
    let rejected = 0;
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < MAX_THREAD_PAGES; pageNumber += 1) {
      const response = await this.request('thread/list', {
        limit: options.pageSize,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: THREAD_SOURCE_KINDS,
        useStateDbOnly: true,
        ...(cursor ? { cursor } : {}),
      }, { signal: options.signal, timeoutMs: this.requestTimeoutMs });
      const page = parseThreadList(response);
      threads.push(...page.threads);
      rejected += page.rejected;
      if (options.stop(threads) || page.nextCursor === null) {
        return { threads, rejected, truncated: false };
      }
      cursor = page.nextCursor;
    }
    return { threads, rejected, truncated: true };
  }

  async describe(): Promise<RuntimeProvider> {
    let health: RuntimeProvider['health'];
    try {
      const response = await this.request('thread/list', {
        limit: 1,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: THREAD_SOURCE_KINDS,
        useStateDbOnly: true,
      }, { timeoutMs: this.requestTimeoutMs });
      const parsed = parseThreadList(response);
      health = parsed.rejected > 0
        ? {
            state: 'degraded',
            checkedAt: this.now().toISOString(),
            message: 'Some Codex thread metadata was incompatible',
          }
        : { state: 'connected', checkedAt: this.now().toISOString() };
    } catch (error) {
      health = error instanceof CodexSchemaError || isProtocolSchemaError(error)
        ? {
            state: 'schema-incompatible',
            checkedAt: this.now().toISOString(),
            message: 'Codex app-server returned incompatible thread metadata',
          }
        : {
            state: 'unavailable',
            checkedAt: this.now().toISOString(),
            message: 'Codex app-server is unavailable',
          };
    }

    return RuntimeProviderSchema.parse({
      id: this.id,
      runtime: 'codex',
      displayName: 'Codex',
      health,
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        logs: { status: 'unsupported', reason: UNSUPPORTED_LOGS },
        blockers: { status: 'unsupported', reason: UNSUPPORTED_BLOCKERS },
        approvals: { status: 'unsupported', reason: UNSUPPORTED_APPROVALS },
        pause: { status: 'unsupported', reason: READ_ONLY_REASON },
        resume: { status: 'unsupported', reason: READ_ONLY_REASON },
        cancellation: { status: 'unsupported', reason: READ_ONLY_REASON },
        policyActions: { status: 'unsupported', reason: READ_ONLY_REASON },
      },
    });
  }

  async getSnapshot(request: RuntimeSnapshotRequest = {}): Promise<RuntimeSnapshot> {
    const limit = normalizeLimit(request.activityLimit);
    let parsed: { threads: CodexThread[]; rejected: number; truncated: boolean };
    try {
      parsed = await this.readThreadPages({
        pageSize: request.workspaceId === undefined ? limit : MAX_ACTIVITY_LIMIT,
        signal: request.signal,
        stop: (threads) => request.workspaceId === undefined || threads.filter(
          (thread) => workspaceId(thread.cwd) === request.workspaceId,
        ).length >= limit,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        const reason = request.signal.reason;
        throw reason instanceof Error ? reason : new Error('Codex snapshot request aborted');
      }
      const incompatible = error instanceof CodexSchemaError || isProtocolSchemaError(error);
      const reason = incompatible
        ? 'Codex app-server returned incompatible thread metadata'
        : 'Codex app-server is unavailable';
      return RuntimeSnapshotSchema.parse({
        providerId: this.id,
        state: incompatible ? 'schema-incompatible' : 'unavailable',
        capturedAt: this.now().toISOString(),
        message: reason,
        workspaces: { status: 'unsupported', reason },
        agents: { status: 'unsupported', reason },
        tasks: { status: 'unsupported', reason: UNSUPPORTED_TASKS },
        runs: { status: 'unsupported', reason: UNSUPPORTED_RUNS },
        events: { status: 'unsupported', reason },
        blockers: { status: 'unsupported', reason: UNSUPPORTED_BLOCKERS },
        approvals: { status: 'unsupported', reason: UNSUPPORTED_APPROVALS },
      });
    }

    const selected = parsed.threads.filter((thread) => (
      request.workspaceId === undefined || workspaceId(thread.cwd) === request.workspaceId
    )).slice(0, limit);
    const workspacesById = new Map<string, RuntimeWorkspace>();
    const agents: RuntimeAgent[] = [];
    const events: RuntimeEvent[] = [];
    for (const thread of selected) {
      const key = workspaceKey(thread.cwd);
      const currentWorkspaceId = workspaceId(thread.cwd);
      workspacesById.set(currentWorkspaceId, {
        id: currentWorkspaceId,
        name: `Codex workspace ${key.slice(0, 8)}`,
        kind: 'project',
        state: 'available',
      });
      const occurredAt = timestamp(thread.updatedAt)!;
      agents.push({
        id: `codex:thread:${thread.id}`,
        workspaceId: currentWorkspaceId,
        displayName: `Codex thread ${thread.id.slice(-4)}`,
        state: agentState(thread.status),
        lastActiveAt: occurredAt,
        metadata: {
          cliVersion: thread.cliVersion,
          ephemeral: thread.ephemeral,
          modelProvider: thread.modelProvider,
          sessionId: thread.sessionId,
        },
      });
      events.push(eventForThread(thread));
    }

    const state = parsed.rejected > 0 || parsed.truncated
      ? 'degraded' as const
      : selected.length > 0 ? 'ready' as const : 'empty' as const;
    const message = parsed.truncated
      ? 'Codex workspace metadata was limited by the bounded scan'
      : parsed.rejected > 0 ? 'Some Codex thread metadata was incompatible' : undefined;
    return RuntimeSnapshotSchema.parse({
      providerId: this.id,
      state,
      capturedAt: this.now().toISOString(),
      ...(message ? { message } : {}),
      workspaces: { status: 'available', data: [...workspacesById.values()].sort((a, b) => a.id.localeCompare(b.id)) },
      agents: { status: 'available', data: agents.sort((a, b) => a.id.localeCompare(b.id)) },
      tasks: { status: 'unsupported', reason: UNSUPPORTED_TASKS },
      runs: { status: 'unsupported', reason: UNSUPPORTED_RUNS },
      events: { status: 'available', data: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) },
      blockers: { status: 'unsupported', reason: UNSUPPORTED_BLOCKERS },
      approvals: { status: 'unsupported', reason: UNSUPPORTED_APPROVALS },
    });
  }

  async getEvents(request: RuntimeEventRequest = {}): Promise<RuntimeEventPage> {
    const limit = normalizeLimit(request.limit);
    const after = parseCursor(request.cursor);
    const parsed = await this.readThreadPages({
      pageSize: MAX_ACTIVITY_LIMIT,
      signal: request.signal,
      stop: (threads) => after === null
        ? request.workspaceId === undefined || threads.filter(
            (thread) => workspaceId(thread.cwd) === request.workspaceId,
          ).length >= limit
        : threads.some((thread) => timestamp(thread.updatedAt)! < after.occurredAt),
    });
    if (parsed.truncated) {
      throw new CodexSchemaError('Codex event pagination exceeded the bounded page limit');
    }
    const matchingThreads = parsed.threads
      .filter((thread) => request.workspaceId === undefined || workspaceId(thread.cwd) === request.workspaceId);
    const candidates = matchingThreads
      .map((thread) => ({
        thread,
        cursor: {
          occurredAt: timestamp(thread.updatedAt)!,
          threadId: thread.id,
          status: thread.status.type,
        },
      }))
      .filter((entry) => {
        if (!after) return true;
        const order = compareCursor(entry.cursor, after);
        if (order <= 0 && after.boundaryStatuses) {
          if (Object.hasOwn(after.boundaryStatuses, entry.cursor.threadId)) {
            return after.boundaryStatuses[entry.cursor.threadId] !== entry.cursor.status;
          }
          if (entry.cursor.occurredAt === after.occurredAt) return true;
        }
        return order > 0 || (order === 0 && after.status !== undefined && entry.cursor.status !== after.status);
      });
    const entries = after
      ? candidates.sort((a, b) => compareCursor(a.cursor, b.cursor)).slice(0, limit)
      : candidates
          .sort((a, b) => compareCursor(b.cursor, a.cursor))
          .slice(0, limit)
          .sort((a, b) => compareCursor(a.cursor, b.cursor));
    const emittedStatuses = after?.boundaryStatuses ? { ...after.boundaryStatuses } : {};
    const events = entries.map((entry) => {
      rememberStatus(emittedStatuses, entry.cursor.threadId, entry.cursor.status);
      return eventForThread(entry.thread, emittedStatuses);
    });
    return RuntimeEventPageSchema.parse({
      events,
      nextCursor: events.at(-1)?.cursor ?? request.cursor ?? null,
    });
  }
}
