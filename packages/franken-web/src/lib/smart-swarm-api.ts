import { extractResponseErrorMessage } from './http-error';

const STREAM_RECONNECT_BASE_DELAY_MS = 1_000;
const STREAM_RECONNECT_MAX_DELAY_MS = 30_000;

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

export type RuntimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export interface RuntimeSubscriptionHandlers {
  event(event: RuntimeEvent): void;
  connection?(state: RuntimeConnectionState): void;
  error?(error: Error): void;
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

  fetchSnapshot(
    providerId: string,
    options: { workspaceId?: string; activityLimit?: number } = {},
  ): Promise<RuntimeSnapshot> {
    const search = new URLSearchParams();
    if (options.workspaceId) search.set('workspaceId', options.workspaceId);
    if (options.activityLimit !== undefined) search.set('activityLimit', String(options.activityLimit));
    const query = search.size > 0 ? `?${search.toString()}` : '';
    return this.request(`/v1/smart-swarm/providers/${encodeURIComponent(providerId)}/snapshot${query}`);
  }

  async subscribe(
    providerId: string,
    workspaceId: string | undefined,
    handlers: RuntimeSubscriptionHandlers,
  ): Promise<() => void> {
    const baseUrl = this.baseUrl;
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
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
      source = new EventSource(`${baseUrl}${streamPath}${query}`, { withCredentials: true });
      source.addEventListener('open', () => {
        reconnectAttempt = 0;
        handlers.connection?.('connected');
      });
      source.addEventListener('activity', (rawEvent) => {
        try {
          const event = JSON.parse((rawEvent as MessageEvent<string>).data) as RuntimeEvent;
          cursor = event.cursor;
          handlers.event(event);
        } catch (error) {
          handlers.error?.(error instanceof Error ? error : new Error('Unable to parse smart-swarm activity.'));
        }
      });
      source.addEventListener('error', () => {
        scheduleReconnect();
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
