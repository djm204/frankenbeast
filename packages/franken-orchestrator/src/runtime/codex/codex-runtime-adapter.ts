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
const THREAD_STATUS_TYPES = new Set(['active', 'idle', 'notLoaded', 'systemError']);

interface CodexThread {
  id: string;
  sessionId: string;
  cliVersion: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  ephemeral: boolean;
  modelProvider: string;
  status: { type: string };
}

class CodexSchemaError extends Error {}

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
  ) return null;
  return thread as unknown as CodexThread;
}

function parseThreadList(value: unknown): { threads: CodexThread[]; rejected: number } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>)['data'])) {
    throw new CodexSchemaError('Codex app-server returned an incompatible thread/list response');
  }
  const values = (value as { data: unknown[] }).data;
  const threads = values.map(parseThread).filter((thread): thread is CodexThread => thread !== null);
  return { threads, rejected: values.length - threads.length };
}

function workspaceKey(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}

function workspaceId(cwd: string): string {
  return `codex:workspace:${workspaceKey(cwd)}`;
}

function agentState(status: string): RuntimeAgent['state'] {
  switch (status) {
    case 'active': return 'running';
    case 'idle': return 'idle';
    case 'notLoaded': return 'offline';
    case 'systemError': return 'blocked';
    default: return 'unknown';
  }
}

function eventCursor(thread: CodexThread): string {
  return Buffer.from(JSON.stringify({
    occurredAt: timestamp(thread.updatedAt),
    threadId: thread.id,
  })).toString('base64url');
}

interface CodexCursor {
  occurredAt: string;
  threadId: string;
}

function parseCursor(value: string | undefined): CodexCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CodexCursor>;
    if (
      typeof decoded.occurredAt !== 'string'
      || Number.isNaN(Date.parse(decoded.occurredAt))
      || new Date(decoded.occurredAt).toISOString() !== decoded.occurredAt
      || typeof decoded.threadId !== 'string'
      || decoded.threadId.length === 0
    ) throw new Error('invalid');
    return decoded as CodexCursor;
  } catch {
    throw new RuntimeCursorError();
  }
}

function compareCursor(a: CodexCursor, b: CodexCursor): number {
  return a.occurredAt.localeCompare(b.occurredAt) || a.threadId.localeCompare(b.threadId);
}

function eventForThread(thread: CodexThread): RuntimeEvent {
  return {
    id: `codex:thread:${thread.id}:${thread.updatedAt}`,
    cursor: eventCursor(thread),
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

  async describe(): Promise<RuntimeProvider> {
    let health: RuntimeProvider['health'];
    try {
      const response = await this.request('thread/list', {
        limit: 1,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        useStateDbOnly: true,
      }, { timeoutMs: this.requestTimeoutMs });
      parseThreadList(response);
      health = { state: 'connected', checkedAt: this.now().toISOString() };
    } catch (error) {
      health = error instanceof CodexSchemaError
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
    let parsed: { threads: CodexThread[]; rejected: number };
    try {
      const response = await this.request('thread/list', {
        limit,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        useStateDbOnly: true,
      }, { signal: request.signal, timeoutMs: this.requestTimeoutMs });
      parsed = parseThreadList(response);
    } catch (error) {
      if (request.signal?.aborted) {
        const reason = request.signal.reason;
        throw reason instanceof Error ? reason : new Error('Codex snapshot request aborted');
      }
      const incompatible = error instanceof CodexSchemaError;
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
    ));
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
        state: agentState(thread.status.type),
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

    const state = parsed.rejected > 0
      ? 'degraded' as const
      : selected.length > 0 ? 'ready' as const : 'empty' as const;
    return RuntimeSnapshotSchema.parse({
      providerId: this.id,
      state,
      capturedAt: this.now().toISOString(),
      ...(parsed.rejected > 0 ? { message: 'Some Codex thread metadata was incompatible' } : {}),
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
    const response = await this.request('thread/list', {
      limit: MAX_ACTIVITY_LIMIT,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      useStateDbOnly: true,
    }, { signal: request.signal, timeoutMs: this.requestTimeoutMs });
    const parsed = parseThreadList(response);
    const entries = parsed.threads
      .filter((thread) => request.workspaceId === undefined || workspaceId(thread.cwd) === request.workspaceId)
      .map((thread) => ({
        cursor: { occurredAt: timestamp(thread.updatedAt)!, threadId: thread.id },
        event: eventForThread(thread),
      }))
      .filter((entry) => !after || compareCursor(entry.cursor, after) > 0)
      .sort((a, b) => compareCursor(a.cursor, b.cursor))
      .slice(0, limit);
    const events = entries.map((entry) => entry.event);
    return RuntimeEventPageSchema.parse({
      events,
      nextCursor: events.at(-1)?.cursor ?? request.cursor ?? null,
    });
  }
}
