import { extractResponseErrorMessage } from './http-error';

const STREAM_RECONNECT_BASE_DELAY_MS = 1_000;
const STREAM_RECONNECT_MAX_DELAY_MS = 30_000;
const CURSOR_VALIDATION_TIMEOUT_MS = 10_000;

export type RuntimeCapability =
  | { status: 'supported' }
  | { status: 'unsupported'; reason: string };

export interface RuntimeCapabilities {
  snapshot: RuntimeCapability;
  streaming: RuntimeCapability;
  logs: RuntimeCapability;
  blockers: RuntimeCapability;
  approvals: RuntimeCapability;
  pause: RuntimeCapability;
  resume: RuntimeCapability;
  cancellation: RuntimeCapability;
  policyActions: RuntimeCapability;
}

export interface RuntimeProvider {
  id: string;
  runtime: string;
  displayName: string;
  health: {
    state: 'loading' | 'connected' | 'degraded' | 'unavailable' | 'schema-incompatible';
    checkedAt: string;
    message?: string;
  };
  capabilities: RuntimeCapabilities;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeWorkspace {
  id: string;
  name: string;
  kind: 'workspace' | 'board' | 'project';
  state: 'available' | 'degraded' | 'unavailable' | 'schema-incompatible';
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeAgent {
  id: string;
  workspaceId: string;
  displayName: string;
  state: 'idle' | 'running' | 'blocked' | 'offline' | 'unknown';
  lastActiveAt: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeTask {
  id: string;
  workspaceId: string;
  title: string;
  state: 'queued' | 'ready' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'archived' | 'unknown';
  parentIds: string[];
  dependencyIds: string[];
  ownerIds: string[];
  priority: number | null;
  createdAt: string;
  updatedAt: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeRun {
  id: string;
  workspaceId: string;
  taskId: string;
  agentId: string | null;
  sessionId: string | null;
  state: 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  startedAt: string;
  finishedAt: string | null;
  lastActiveAt: string | null;
  summary: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeEvent {
  id: string;
  cursor: string;
  workspaceId: string;
  taskId: string | null;
  runId: string | null;
  type: 'lifecycle' | 'comment' | 'log' | 'audit' | 'blocker' | 'approval' | 'unknown';
  occurredAt: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeBlocker {
  id: string;
  workspaceId: string;
  taskId: string;
  category: 'dependency' | 'needs-input' | 'capability' | 'transient' | 'unknown';
  summary: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RuntimeApproval {
  id: string;
  workspaceId: string;
  taskId: string | null;
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'unknown';
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export type RuntimeSection<T> =
  | { status: 'available'; data: T }
  | { status: 'unsupported'; reason: string };

export interface RuntimeSnapshot {
  providerId: string;
  state: 'loading' | 'ready' | 'empty' | 'degraded' | 'unavailable' | 'schema-incompatible';
  capturedAt: string;
  message?: string;
  workspaces: RuntimeSection<RuntimeWorkspace[]>;
  agents: RuntimeSection<RuntimeAgent[]>;
  tasks: RuntimeSection<RuntimeTask[]>;
  runs: RuntimeSection<RuntimeRun[]>;
  events: RuntimeSection<RuntimeEvent[]>;
  blockers: RuntimeSection<RuntimeBlocker[]>;
  approvals: RuntimeSection<RuntimeApproval[]>;
}

export interface RuntimeEventPage {
  events: RuntimeEvent[];
  nextCursor: string | null;
}

export type RuntimeAction =
  | { type: 'approval.resolve'; workspaceId: string; approvalId: string; decision: 'approve' | 'reject'; reason?: string }
  | { type: 'blocker.add'; workspaceId: string; taskId: string; category: 'dependency' | 'needs-input' | 'capability' | 'transient'; reason: string }
  | { type: 'blocker.resolve'; workspaceId: string; taskId: string; reason?: string }
  | { type: 'task.pause' | 'task.resume' | 'task.cancel'; workspaceId: string; taskId: string; reason?: string }
  | { type: 'policy.apply'; workspaceId: string; taskId: string; policy: 'promote-task'; reason: string };

export interface RuntimeActionRequest {
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  action: RuntimeAction;
}

export interface RuntimeActionAudit {
  requestedBy: 'authenticated-operator';
  actionType: RuntimeAction['type'];
  targetId: string;
  outcome: 'applied' | 'unsupported' | 'rejected' | 'failed';
  previousState?: string;
  currentState?: string;
}

export type RuntimeActionResult =
  | { status: 'applied'; providerId: string; correlationId: string; replayed?: boolean; audit: RuntimeActionAudit }
  | { status: 'unsupported' | 'rejected'; providerId: string; correlationId: string; reason: string; audit: RuntimeActionAudit }
  | { status: 'failed'; providerId: string; correlationId: string; reason: string; audit: RuntimeActionAudit };

export type RuntimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export interface RuntimeSubscriptionHandlers {
  event(event: RuntimeEvent): void;
  connection?(state: RuntimeConnectionState): void;
  error?(error: Error): void;
}

const RUNTIME_EVENT_TYPES = new Set<RuntimeEvent['type']>([
  'lifecycle', 'comment', 'log', 'audit', 'blocker', 'approval', 'unknown',
]);
const NORMALIZED_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const RUNTIME_EVENT_KEYS = new Set([
  'id', 'cursor', 'workspaceId', 'taskId', 'runId', 'type', 'occurredAt', 'summary', 'metadata',
]);
const MAX_RUNTIME_EVENT_ID_LENGTH = 1_024;
const MAX_RUNTIME_EVENT_CURSOR_LENGTH = 4_096;
const MAX_RUNTIME_EVENT_SUMMARY_LENGTH = 16_384;
const MAX_RUNTIME_EVENT_METADATA_LENGTH = 16_384;
const MAX_RUNTIME_EVENT_METADATA_ENTRIES = 64;
const MAX_RUNTIME_EVENT_METADATA_KEY_LENGTH = 256;
const MAX_RUNTIME_EVENT_METADATA_STRING_LENGTH = 4_096;
const MAX_RUNTIME_EVENT_RAW_PAYLOAD_LENGTH = 262_144;

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= maximum;
}

function isRuntimeEventMetadata(value: unknown): value is RuntimeEvent['metadata'] {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_RUNTIME_EVENT_METADATA_ENTRIES) return false;
  if (JSON.stringify(value).length > MAX_RUNTIME_EVENT_METADATA_LENGTH) return false;
  return entries.every(([key, entry]) => (
    key.length > 0
    && key.length <= MAX_RUNTIME_EVENT_METADATA_KEY_LENGTH
    && (entry === null
      || typeof entry === 'boolean'
      || (typeof entry === 'number' && Number.isFinite(entry))
      || isBoundedString(entry, MAX_RUNTIME_EVENT_METADATA_STRING_LENGTH, true))
  ));
}

function parseRuntimeEvent(value: unknown): RuntimeEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed runtime event: expected an object.');
  }
  const candidate = value as Partial<RuntimeEvent>;
  if (
    Object.keys(value).some((key) => !RUNTIME_EVENT_KEYS.has(key))
    || !isBoundedString(candidate.id, MAX_RUNTIME_EVENT_ID_LENGTH)
    || !isBoundedString(candidate.cursor, MAX_RUNTIME_EVENT_CURSOR_LENGTH)
    || !isBoundedString(candidate.workspaceId, MAX_RUNTIME_EVENT_ID_LENGTH)
    || (candidate.taskId !== null && !isBoundedString(candidate.taskId, MAX_RUNTIME_EVENT_ID_LENGTH))
    || (candidate.runId !== null && !isBoundedString(candidate.runId, MAX_RUNTIME_EVENT_ID_LENGTH))
    || typeof candidate.type !== 'string' || !RUNTIME_EVENT_TYPES.has(candidate.type as RuntimeEvent['type'])
    || !isBoundedString(candidate.occurredAt, 64)
    || !NORMALIZED_TIMESTAMP_PATTERN.test(candidate.occurredAt)
    || !Number.isFinite(Date.parse(candidate.occurredAt))
    || !isBoundedString(candidate.summary, MAX_RUNTIME_EVENT_SUMMARY_LENGTH, true)
    || !isRuntimeEventMetadata(candidate.metadata)
  ) {
    throw new Error('Malformed runtime event: normalized provenance fields are invalid or exceed safe limits.');
  }
  return candidate as RuntimeEvent;
}

function isRuntimeEventSection(value: unknown): value is RuntimeSnapshot['events'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { status?: unknown; data?: unknown; reason?: unknown };
  const keys = Object.keys(value);
  if (candidate.status === 'available') {
    return keys.length === 2 && keys.includes('data') && Array.isArray(candidate.data);
  }
  return candidate.status === 'unsupported'
    && keys.length === 2
    && keys.includes('reason')
    && typeof candidate.reason === 'string'
    && candidate.reason.length > 0;
}

export class SmartSwarmApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SmartSwarmApiError';
  }
}

function isPermanentAuthenticationError(error: unknown): boolean {
  return error instanceof SmartSwarmApiError && (error.status === 401 || error.status === 403);
}

export class SmartSwarmApiClient {
  constructor(private readonly baseUrl: string) {}

  listProviders(): Promise<RuntimeProvider[]> {
    return this.request('/v1/smart-swarm/providers');
  }

  async fetchSnapshot(
    providerId: string,
    options: { workspaceId?: string; activityLimit?: number } = {},
  ): Promise<RuntimeSnapshot> {
    const search = new URLSearchParams();
    if (options.workspaceId) search.set('workspaceId', options.workspaceId);
    if (options.activityLimit !== undefined) search.set('activityLimit', String(options.activityLimit));
    const query = search.size > 0 ? `?${search.toString()}` : '';
    const snapshot = await this.request<RuntimeSnapshot>(
      `/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/snapshot${query}`,
    );
    if (!isRuntimeEventSection(snapshot.events)) {
      throw new Error('Malformed runtime event snapshot: expected a normalized event section.');
    }
    if (snapshot.events.status === 'available') snapshot.events.data.forEach(parseRuntimeEvent);
    return snapshot;
  }

  async executeAction(providerId: string, request: RuntimeActionRequest): Promise<RuntimeActionResult> {
    const response = await fetch(
      `${this.baseUrl}/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/actions`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      const message = await extractResponseErrorMessage(response);
      throw new SmartSwarmApiError(message ?? `HTTP ${response.status}`, response.status);
    }
    const body = await response.json() as { data: RuntimeActionResult };
    return body.data;
  }

  async subscribe(
    providerId: string,
    workspaceId: string | undefined,
    handlers: RuntimeSubscriptionHandlers,
  ): Promise<() => void> {
    const baseUrl = this.baseUrl;
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let cursorValidationController: AbortController | undefined;
    let cursorValidationTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let cursor: string | undefined;
    let closed = false;

    const closeSource = () => {
      source?.close();
      source = undefined;
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      closeSource();
      handlers.connection?.('reconnecting');
      reconnectAttempt += 1;
      const exponentialDelay = Math.min(
        STREAM_RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1),
        STREAM_RECONNECT_MAX_DELAY_MS,
      );
      const reconnectDelay = Math.min(
        exponentialDelay + Math.random() * STREAM_RECONNECT_BASE_DELAY_MS,
        STREAM_RECONNECT_MAX_DELAY_MS,
      );
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect().catch((error: unknown) => {
          if (closed) return;
          handlers.error?.(error instanceof Error ? error : new Error('Unable to reconnect smart-swarm activity.'));
          if (isPermanentAuthenticationError(error)) handlers.connection?.('unavailable');
          else scheduleReconnect();
        });
      }, reconnectDelay);
    };

    async function connect() {
      const ticketPath = `/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/events/ticket`;
      const response = await fetch(`${baseUrl}${ticketPath}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const message = await extractResponseErrorMessage(response);
        throw new SmartSwarmApiError(message ?? `HTTP ${response.status}`, response.status);
      }
      const { connectionId } = await response.json() as { connectionId: string };
      if (closed) return;

      const search = new URLSearchParams();
      if (workspaceId) search.set('workspaceId', workspaceId);
      if (cursor) search.set('cursor', cursor);
      const query = search.size > 0 ? `?${search.toString()}` : '';
      const streamPath = `/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/events/${encodeURIComponent(connectionId)}`;
      const activeSource = new EventSource(`${baseUrl}${streamPath}${query}`, { withCredentials: true });
      source = activeSource;
      let opened = false;
      let handlingPreOpenFailure = false;
      activeSource.addEventListener('open', () => {
        if (source !== activeSource || closed) return;
        opened = true;
        reconnectAttempt = 0;
        handlers.connection?.('connected');
      });
      activeSource.addEventListener('checkpoint', (rawEvent) => {
        if (source !== activeSource || closed) return;
        const lastEventId = (rawEvent as MessageEvent<string>).lastEventId;
        if (!lastEventId) return;
        if (!isBoundedString(lastEventId, MAX_RUNTIME_EVENT_CURSOR_LENGTH)) {
          handlers.error?.(new Error('Malformed checkpoint cursor: value exceeds safe limits.'));
          scheduleReconnect();
          return;
        }
        cursor = lastEventId;
      });
      activeSource.addEventListener('activity', (rawEvent) => {
        if (source !== activeSource || closed) return;
        try {
          const data = (rawEvent as MessageEvent<unknown>).data;
          if (typeof data !== 'string' || data.length > MAX_RUNTIME_EVENT_RAW_PAYLOAD_LENGTH) {
            throw new Error('Malformed activity payload: raw data exceeds safe limits.');
          }
          const event = parseRuntimeEvent(JSON.parse(data));
          cursor = event.cursor;
          handlers.event(event);
        } catch (error) {
          handlers.error?.(error instanceof Error ? error : new Error('Unable to parse smart-swarm activity.'));
          scheduleReconnect();
        }
      });
      activeSource.addEventListener('error', () => {
        if (source !== activeSource || closed || handlingPreOpenFailure) return;
        if (opened || !cursor) {
          scheduleReconnect();
          return;
        }
        handlingPreOpenFailure = true;
        activeSource.close();
        const failedCursor = cursor;
        const validationSearch = new URLSearchParams({ cursor: failedCursor, limit: '1' });
        if (workspaceId) validationSearch.set('workspaceId', workspaceId);
        const validationController = new AbortController();
        cursorValidationController = validationController;
        cursorValidationTimer = setTimeout(() => {
          if (cursorValidationController !== validationController) return;
          cursorValidationController = undefined;
          cursorValidationTimer = undefined;
          validationController.abort();
          if (source === activeSource && !closed) scheduleReconnect();
        }, CURSOR_VALIDATION_TIMEOUT_MS);
        void fetch(
          `${baseUrl}/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/events?${validationSearch.toString()}`,
          { method: 'GET', credentials: 'include', signal: validationController.signal },
        ).then((response) => {
          if (cursorValidationController !== validationController) return;
          if (cursorValidationTimer) clearTimeout(cursorValidationTimer);
          cursorValidationController = undefined;
          cursorValidationTimer = undefined;
          if (source !== activeSource || closed) return;
          if (response.status === 422 && cursor === failedCursor) cursor = undefined;
          scheduleReconnect();
        }).catch(() => {
          if (cursorValidationController !== validationController) return;
          if (cursorValidationTimer) clearTimeout(cursorValidationTimer);
          cursorValidationController = undefined;
          cursorValidationTimer = undefined;
          if (source === activeSource && !closed) scheduleReconnect();
        });
      });
    }

    try {
      await connect();
    } catch (error) {
      handlers.error?.(error instanceof Error ? error : new Error('Unable to connect smart-swarm activity.'));
      if (isPermanentAuthenticationError(error)) handlers.connection?.('unavailable');
      else scheduleReconnect();
    }
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (cursorValidationTimer) clearTimeout(cursorValidationTimer);
      cursorValidationController?.abort();
      cursorValidationController = undefined;
      cursorValidationTimer = undefined;
      closeSource();
    };
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: 'GET' });
    if (!response.ok) {
      const message = await extractResponseErrorMessage(response);
      throw new SmartSwarmApiError(message ?? `HTTP ${response.status}`, response.status);
    }
    const body = await response.json() as { data: T };
    return body.data;
  }
}
