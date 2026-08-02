import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  RuntimeActionResultSchema,
  RuntimeEventPageSchema,
  RuntimeSnapshotSchema,
  RuntimeProviderSchema,
  type RuntimeActionRequest,
  type RuntimeActionResult,
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
const MAX_THREAD_PAGE_SIZE = 50;
const MAX_THREAD_PAGES = 100;
const MAX_CURSOR_JSON_BYTES = 64 * 1024;
const MAX_EVENT_CURSOR_BYTES = 4_096;
const MAX_NORMALIZED_METADATA_STRING_LENGTH = 4_096;
// Reserves the remaining RuntimeEvent id budget for timestamp, status, and the
// largest valid safe-integer transition suffix.
const MAX_THREAD_ID_LENGTH = 956;
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
  archived?: boolean | undefined;
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

function isBoundedString(value: unknown, maximum: number, allowEmpty = true): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= maximum;
}

function parseThread(value: unknown): CodexThread | null {
  if (!value || typeof value !== 'object') return null;
  const thread = value as Record<string, unknown>;
  if (
    !isBoundedString(thread['id'], MAX_THREAD_ID_LENGTH, false)
    || !isBoundedString(thread['sessionId'], MAX_NORMALIZED_METADATA_STRING_LENGTH)
    || !isBoundedString(thread['cliVersion'], MAX_NORMALIZED_METADATA_STRING_LENGTH)
    || typeof thread['createdAt'] !== 'number'
    || typeof thread['updatedAt'] !== 'number'
    || !timestamp(thread['createdAt'])
    || !timestamp(thread['updatedAt'])
    || typeof thread['cwd'] !== 'string'
    || typeof thread['ephemeral'] !== 'boolean'
    || !isBoundedString(thread['modelProvider'], MAX_NORMALIZED_METADATA_STRING_LENGTH)
    || !thread['status']
    || typeof thread['status'] !== 'object'
    || typeof (thread['status'] as Record<string, unknown>)['type'] !== 'string'
    || !THREAD_STATUS_TYPES.has((thread['status'] as Record<string, unknown>)['type'] as string)
    || (
      (thread['status'] as Record<string, unknown>)['type'] === 'active'
      && !Array.isArray((thread['status'] as Record<string, unknown>)['activeFlags'])
    )
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

function threadKey(threadId: string): string {
  return createHash('sha256').update(threadId).digest('hex').slice(0, 16);
}

function agentState(status: CodexThread['status']): RuntimeAgent['state'] {
  switch (status.type) {
    case 'active': return status.activeFlags?.some((flag) => (
      flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'
    )) ? 'blocked' : 'running';
    case 'idle': return 'idle';
    // A freshly spawned read-only app-server reports threads owned by other
    // Codex processes as notLoaded, which is not evidence they are offline.
    case 'notLoaded': return 'unknown';
    case 'systemError': return 'blocked';
    default: return 'unknown';
  }
}

function eventStatus(thread: CodexThread): string {
  if (thread.archived) return 'archived';
  if (thread.status.type === 'active' && agentState(thread.status) === 'blocked') return 'blocked';
  return thread.status.type;
}

interface CodexBoundaryThread {
  threadId: string;
  workspaceId: string;
  status: string;
  transitionSequence: number;
}

interface CodexCursorEncodingState {
  boundarySaturated: boolean;
}

function eventCursor(
  status: string,
  boundaryThreads?: Record<string, CodexBoundaryThread>,
  watermark?: Pick<CodexCursor, 'occurredAt' | 'threadId'>,
  scopeWorkspaceId?: string,
  encodingState?: CodexCursorEncodingState,
): string {
  const serializedThreads = boundaryThreads
    ? Object.values(boundaryThreads).map((thread) => [
        thread.threadId,
        thread.workspaceId,
        thread.status,
        thread.transitionSequence,
      ])
    : undefined;
  let boundarySaturated = encodingState?.boundarySaturated ?? false;
  const encode = (): string => {
    const payload = Buffer.from(JSON.stringify({
      version: 3,
      occurredAt: watermark?.occurredAt,
      threadId: watermark?.threadId,
      status,
      ...(scopeWorkspaceId !== undefined ? { workspaceId: scopeWorkspaceId } : {}),
      ...(serializedThreads ? { boundaryThreads: serializedThreads } : {}),
      ...(boundarySaturated ? { boundarySaturated: true } : {}),
    }));
    return `z.${deflateRawSync(payload).toString('base64url')}`;
  };
  let encoded = encode();
  if (Buffer.byteLength(encoded) > MAX_EVENT_CURSOR_BYTES && serializedThreads?.length) {
    boundarySaturated = true;
    let lowerBound = 1;
    let upperBound = serializedThreads.length;
    while (lowerBound < upperBound) {
      const midpoint = Math.floor((lowerBound + upperBound) / 2);
      const retained = serializedThreads.splice(0, midpoint);
      const candidate = encode();
      serializedThreads.unshift(...retained);
      if (Buffer.byteLength(candidate) <= MAX_EVENT_CURSOR_BYTES) upperBound = midpoint;
      else lowerBound = midpoint + 1;
    }
    serializedThreads.splice(0, lowerBound);
    encoded = encode();
  }
  if (boundarySaturated && encodingState) encodingState.boundarySaturated = true;
  return encoded;
}

interface CodexCursor {
  occurredAt: string;
  threadId: string;
  status?: string | undefined;
  workspaceId?: string | undefined;
  boundaryStatuses?: Record<string, string> | undefined;
  boundaryThreads?: Record<string, CodexBoundaryThread> | undefined;
  boundarySaturated?: boolean | undefined;
}

function parseCursor(value: string | undefined): CodexCursor | null {
  if (!value) return null;
  if (Buffer.byteLength(value) > MAX_EVENT_CURSOR_BYTES) throw new RuntimeCursorError();
  try {
    const serialized = value.startsWith('z.')
      ? inflateRawSync(Buffer.from(value.slice(2), 'base64url'), {
          maxOutputLength: MAX_CURSOR_JSON_BYTES,
        }).toString('utf8')
      : Buffer.from(value, 'base64url').toString('utf8');
    const decoded = JSON.parse(serialized) as Record<string, unknown>;
    const boundaryStatuses = decoded['boundaryStatuses'];
    const boundaryThreads = decoded['boundaryThreads'];
    if (
      (decoded['version'] !== undefined && decoded['version'] !== 2 && decoded['version'] !== 3)
      || Buffer.byteLength(serialized) > MAX_CURSOR_JSON_BYTES
      || typeof decoded['occurredAt'] !== 'string'
      || Number.isNaN(Date.parse(decoded.occurredAt))
      || new Date(decoded.occurredAt).toISOString() !== decoded.occurredAt
      || typeof decoded.threadId !== 'string'
      || decoded.threadId.length === 0
      || (decoded.status !== undefined && (typeof decoded.status !== 'string' || decoded.status.length === 0))
      || (decoded.workspaceId !== undefined && (
        typeof decoded.workspaceId !== 'string'
        || !/^codex:workspace:[a-f0-9]{16}$/.test(decoded.workspaceId)
      ))
      || (decoded.boundarySaturated !== undefined && (
        decoded['version'] !== 3 || typeof decoded.boundarySaturated !== 'boolean'
      ))
      || (boundaryStatuses !== undefined && (
        boundaryStatuses === null
        || typeof boundaryStatuses !== 'object'
        || Array.isArray(boundaryStatuses)
        || Object.entries(boundaryStatuses).length > MAX_ACTIVITY_LIMIT
        || Object.entries(boundaryStatuses).some(([id, status]) => (
          id.length === 0
          || (decoded['version'] === 2 && !/^[a-f0-9]{16}$/.test(id))
          || typeof status !== 'string'
          || status.length === 0
        ))
      ))
      || (boundaryThreads !== undefined && (
        decoded['version'] !== 3
        || !Array.isArray(boundaryThreads)
        || boundaryThreads.length > MAX_ACTIVITY_LIMIT
        || boundaryThreads.some((thread) => (
          !Array.isArray(thread)
          || (thread.length !== 3 && thread.length !== 4)
          || typeof thread[0] !== 'string'
          || thread[0].length === 0
          || thread[0].length > 1_024
          || typeof thread[1] !== 'string'
          || !/^codex:workspace:[a-f0-9]{16}$/.test(thread[1])
          || typeof thread[2] !== 'string'
          || thread[2].length === 0
          || thread[2].length > 64
          || (thread.length === 4 && (
            !Number.isSafeInteger(thread[3])
            || (thread[3] as number) < 0
          ))
        ))
      ))
    ) throw new Error('invalid');
    const normalizedBoundaryThreads = boundaryThreads === undefined
      ? undefined
      : Object.fromEntries((boundaryThreads as [string, string, string, number?][]).map(
          ([threadId, currentWorkspaceId, status, transitionSequence = 0]) => [
            threadKey(threadId),
            { threadId, workspaceId: currentWorkspaceId, status, transitionSequence },
          ],
        ));
    const normalizedStatuses = normalizedBoundaryThreads !== undefined
      ? Object.fromEntries(Object.entries(normalizedBoundaryThreads).map(
          ([key, thread]) => [key, thread.status],
        ))
      : boundaryStatuses === undefined
        ? undefined
        : Object.fromEntries(Object.entries(boundaryStatuses as Record<string, string>).map(
            ([id, status]) => [decoded['version'] === 2 ? id : threadKey(id), status],
          ));
    return {
      occurredAt: decoded['occurredAt'] as string,
      threadId: decoded['threadId'] as string,
      ...(decoded['status'] !== undefined ? { status: decoded['status'] as string } : {}),
      ...(decoded['workspaceId'] !== undefined ? { workspaceId: decoded['workspaceId'] as string } : {}),
      ...(normalizedStatuses !== undefined
        ? { boundaryStatuses: normalizedStatuses }
        : {}),
      ...(normalizedBoundaryThreads !== undefined
        ? { boundaryThreads: normalizedBoundaryThreads }
        : {}),
      ...(decoded['boundarySaturated'] === true ? { boundarySaturated: true } : {}),
    };
  } catch {
    throw new RuntimeCursorError();
  }
}

function compareCursor(a: CodexCursor, b: CodexCursor): number {
  return a.occurredAt.localeCompare(b.occurredAt) || a.threadId.localeCompare(b.threadId);
}

function rememberThread(
  threads: Record<string, CodexBoundaryThread>,
  thread: CodexBoundaryThread,
): void {
  const key = threadKey(thread.threadId);
  if (Object.hasOwn(threads, key)) {
    delete threads[key];
  } else if (Object.keys(threads).length >= MAX_ACTIVITY_LIMIT) {
    const oldestThreadKey = Object.keys(threads)[0];
    if (oldestThreadKey !== undefined) delete threads[oldestThreadKey];
  }
  threads[key] = thread;
}

function eventForThread(
  thread: CodexThread,
  boundaryThreads?: Record<string, CodexBoundaryThread>,
  watermark?: Pick<CodexCursor, 'occurredAt' | 'threadId'>,
  scopeWorkspaceId?: string,
  transitionSequence?: number,
  encodingState?: CodexCursorEncodingState,
): RuntimeEvent {
  const currentWatermark = watermark ?? {
    occurredAt: timestamp(thread.updatedAt)!,
    threadId: thread.id,
  };
  return {
    id: `codex:thread:${thread.id}:${thread.updatedAt}:${eventStatus(thread)}`
      + (transitionSequence ? `:transition-${transitionSequence}` : ''),
    cursor: eventCursor(
      eventStatus(thread),
      boundaryThreads,
      currentWatermark,
      scopeWorkspaceId,
      encodingState,
    ),
    workspaceId: workspaceId(thread.cwd),
    taskId: null,
    runId: null,
    type: 'lifecycle',
    occurredAt: timestamp(thread.updatedAt)!,
    summary: `Codex thread is ${eventStatus(thread)}`,
    metadata: { agentId: `codex:thread:${thread.id}`, sessionId: thread.sessionId },
  };
}

function eventForDisappearedThread(
  thread: CodexBoundaryThread,
  occurredAt: string,
  boundaryThreads: Record<string, CodexBoundaryThread>,
  watermark: Pick<CodexCursor, 'occurredAt' | 'threadId'>,
  scopeWorkspaceId?: string,
  transitionSequence?: number,
  encodingState?: CodexCursorEncodingState,
): RuntimeEvent {
  return {
    id: `codex:thread:${thread.threadId}:disappeared`
      + (transitionSequence ? `:transition-${transitionSequence}` : ''),
    cursor: eventCursor('disappeared', boundaryThreads, watermark, scopeWorkspaceId, encodingState),
    workspaceId: thread.workspaceId,
    taskId: null,
    runId: null,
    type: 'lifecycle',
    occurredAt,
    summary: 'Codex thread disappeared',
    metadata: { agentId: `codex:thread:${thread.threadId}` },
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

  async executeAction(request: RuntimeActionRequest): Promise<RuntimeActionResult> {
    const targetId = request.action.type === 'approval.resolve'
      ? request.action.approvalId
      : request.action.taskId;
    return RuntimeActionResultSchema.parse({
      status: 'unsupported',
      providerId: this.id,
      correlationId: request.correlationId,
      reason: READ_ONLY_REASON,
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: request.action.type,
        targetId,
        outcome: 'unsupported',
      },
    });
  }

  private async readThreadPages(options: {
    pageSize: number;
    signal?: AbortSignal | undefined;
    archived?: boolean | undefined;
    stop: (threads: CodexThread[]) => boolean;
  }): Promise<{ threads: CodexThread[]; rejected: number; truncated: boolean }> {
    const threads: CodexThread[] = [];
    let rejected = 0;
    let cursor: string | null = null;
    const deadline = Date.now() + this.requestTimeoutMs;
    for (let pageNumber = 0; pageNumber < MAX_THREAD_PAGES; pageNumber += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error('Codex thread metadata scan timed out');
      const response = await this.request('thread/list', {
        limit: Math.min(options.pageSize, MAX_THREAD_PAGE_SIZE),
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: THREAD_SOURCE_KINDS,
        useStateDbOnly: true,
        ...(options.archived !== undefined ? { archived: options.archived } : {}),
        ...(cursor ? { cursor } : {}),
      }, { signal: options.signal, timeoutMs: remainingMs });
      const page = parseThreadList(response);
      threads.push(...page.threads.map((thread) => (
        options.archived ? { ...thread, archived: true } : thread
      )));
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
        stop: (threads) => request.workspaceId === undefined
          ? threads.length >= limit
          : threads.filter((thread) => workspaceId(thread.cwd) === request.workspaceId).length >= limit,
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
    const snapshotBoundaryThreads: Record<string, CodexBoundaryThread> = {};
    for (const thread of selected) {
      rememberThread(snapshotBoundaryThreads, {
        threadId: thread.id,
        workspaceId: workspaceId(thread.cwd),
        status: eventStatus(thread),
        transitionSequence: 0,
      });
    }
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
      events.push(eventForThread(thread, snapshotBoundaryThreads, undefined, request.workspaceId));
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
      events: {
        status: 'available',
        data: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)),
      },
      blockers: { status: 'unsupported', reason: UNSUPPORTED_BLOCKERS },
      approvals: { status: 'unsupported', reason: UNSUPPORTED_APPROVALS },
    });
  }

  async getEvents(request: RuntimeEventRequest = {}): Promise<RuntimeEventPage> {
    const limit = normalizeLimit(request.limit);
    const after = parseCursor(request.cursor);
    if (after && after.workspaceId !== request.workspaceId) throw new RuntimeCursorError();
    const stop = (threads: CodexThread[]): boolean => after === null
      ? request.workspaceId === undefined
        ? threads.length >= limit
        : threads.filter((thread) => workspaceId(thread.cwd) === request.workspaceId).length >= limit
      : threads.some((thread) => timestamp(thread.updatedAt)! < after.occurredAt);
    const active = await this.readThreadPages({
      pageSize: MAX_ACTIVITY_LIMIT,
      signal: request.signal,
      archived: false,
      stop,
    });
    const archived = await this.readThreadPages({
      pageSize: MAX_ACTIVITY_LIMIT,
      signal: request.signal,
      archived: true,
      stop,
    });
    if (active.truncated || archived.truncated) {
      throw new CodexSchemaError('Codex event pagination exceeded the bounded page limit');
    }
    if (active.rejected > 0 || archived.rejected > 0) {
      throw new CodexSchemaError('Codex app-server returned incompatible thread metadata');
    }
    const activeIds = new Set(active.threads.map((thread) => thread.id));
    let matchingThreads = [...active.threads, ...archived.threads.filter(
      (thread) => !activeIds.has(thread.id),
    )]
      .filter((thread) => request.workspaceId === undefined || workspaceId(thread.cwd) === request.workspaceId);
    const observedKeys = new Set(matchingThreads.map((thread) => threadKey(thread.id)));
    const trackedBoundaryThreads = after?.boundaryThreads;
    const trackedLiveKeys = trackedBoundaryThreads === undefined
      ? []
      : Object.entries(trackedBoundaryThreads)
          .filter(([, thread]) => thread.status !== 'disappeared')
          .map(([key]) => key);
    const needsAbsenceConfirmation = trackedLiveKeys.some((key) => !observedKeys.has(key));
    if (needsAbsenceConfirmation) {
      const confirmedActive = await this.readThreadPages({
        pageSize: MAX_ACTIVITY_LIMIT,
        signal: request.signal,
        archived: false,
        stop: (threads) => {
          const confirmedKeys = new Set(threads.map((thread) => threadKey(thread.id)));
          return trackedLiveKeys.every((key) => confirmedKeys.has(key));
        },
      });
      const confirmedActiveKeys = new Set(confirmedActive.threads.map((thread) => threadKey(thread.id)));
      const trackedKeysMissingFromActive = new Set(trackedLiveKeys.filter(
        (key) => !confirmedActiveKeys.has(key),
      ));
      const confirmedArchived = await this.readThreadPages({
        pageSize: MAX_ACTIVITY_LIMIT,
        signal: request.signal,
        archived: true,
        stop: (threads) => [...trackedKeysMissingFromActive].every((key) => (
          threads.some((thread) => threadKey(thread.id) === key)
        )),
      });
      if (confirmedActive.truncated || confirmedArchived.truncated) {
        throw new CodexSchemaError('Codex event pagination exceeded the bounded page limit');
      }
      if (confirmedActive.rejected > 0 || confirmedArchived.rejected > 0) {
        throw new CodexSchemaError('Codex app-server returned incompatible thread metadata');
      }
      const threadsById = new Map(matchingThreads.map((thread) => [thread.id, thread]));
      for (const thread of [...confirmedActive.threads, ...confirmedArchived.threads]) {
        if (request.workspaceId === undefined || workspaceId(thread.cwd) === request.workspaceId) {
          threadsById.set(thread.id, thread);
        }
      }
      matchingThreads = [...threadsById.values()];
    }
    const threadCandidates = matchingThreads
      .map((thread) => ({
        kind: 'thread' as const,
        thread,
        cursor: {
          occurredAt: timestamp(thread.updatedAt)!,
          threadId: thread.id,
          status: eventStatus(thread),
        },
      }))
      .filter((entry) => {
        if (!after) return true;
        const order = compareCursor(entry.cursor, after);
        if (order <= 0 && after.boundaryStatuses) {
          const key = threadKey(entry.cursor.threadId);
          if (Object.hasOwn(after.boundaryStatuses, key)) {
            return after.boundaryStatuses[key] !== entry.cursor.status;
          }
          if (
            entry.cursor.occurredAt === after.occurredAt
            && after.boundarySaturated !== true
            && Object.keys(after.boundaryStatuses).length < MAX_ACTIVITY_LIMIT
          ) return true;
        }
        return order > 0 || (order === 0 && after.status !== undefined && entry.cursor.status !== after.status);
      });
    const currentThreadKeys = new Set(matchingThreads.map((thread) => threadKey(thread.id)));
    const observedAt = this.now().toISOString();
    const disappearedAt = after && observedAt <= after.occurredAt
      ? new Date(Date.parse(after.occurredAt) + 1).toISOString()
      : observedAt;
    const disappearedCandidates = after?.boundaryThreads
      ? Object.entries(after.boundaryThreads)
          .filter(([key, thread]) => thread.status !== 'disappeared' && !currentThreadKeys.has(key))
          .map(([key, thread]) => ({
            kind: 'disappeared' as const,
            key,
            thread,
            cursor: {
              occurredAt: disappearedAt,
              threadId: thread.threadId,
              status: 'disappeared',
            },
          }))
      : [];
    const candidates = [...threadCandidates, ...disappearedCandidates];
    const entries = after
      ? candidates.sort((a, b) => compareCursor(a.cursor, b.cursor)).slice(0, limit)
      : candidates
          .sort((a, b) => compareCursor(b.cursor, a.cursor))
          .slice(0, limit)
          .sort((a, b) => compareCursor(a.cursor, b.cursor));
    const emittedThreads = after?.boundaryThreads ? { ...after.boundaryThreads } : {};
    const cursorEncodingState: CodexCursorEncodingState = {
      boundarySaturated: after?.boundarySaturated === true,
    };
    let watermark: Pick<CodexCursor, 'occurredAt' | 'threadId'> | undefined = after ?? undefined;
    const events = entries.map((entry) => {
      if (entry.kind === 'thread') {
        const previousThread = emittedThreads[threadKey(entry.thread.id)];
        const transitionSequence = previousThread === undefined
          ? 0
          : previousThread.status === entry.cursor.status
            ? previousThread.transitionSequence
            : previousThread.transitionSequence + 1;
        rememberThread(emittedThreads, {
          threadId: entry.thread.id,
          workspaceId: workspaceId(entry.thread.cwd),
          status: entry.cursor.status,
          transitionSequence,
        });
        if (!watermark || compareCursor(entry.cursor, watermark) > 0) {
          watermark = entry.cursor;
        }
        return eventForThread(
          entry.thread,
          emittedThreads,
          watermark,
          request.workspaceId,
          transitionSequence,
          cursorEncodingState,
        );
      } else {
        const transitionSequence = entry.thread.transitionSequence + 1;
        rememberThread(emittedThreads, {
          ...entry.thread,
          status: 'disappeared',
          transitionSequence,
        });
        if (!watermark || compareCursor(entry.cursor, watermark) > 0) {
          watermark = entry.cursor;
        }
        return eventForDisappearedThread(
          entry.thread,
          entry.cursor.occurredAt,
          emittedThreads,
          watermark,
          request.workspaceId,
          transitionSequence,
          cursorEncodingState,
        );
      }
    });
    return RuntimeEventPageSchema.parse({
      events,
      nextCursor: events.at(-1)?.cursor ?? request.cursor ?? null,
    });
  }
}
