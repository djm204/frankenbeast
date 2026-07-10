import { MODULE_CONFIG_KEYS, TRACKED_AGENT_STATUSES } from '@franken/types';
import type {
  ApiDataEnvelope,
  ApiErrorEnvelope,
  BeastCatalogEntry,
  BeastContainerRuntimeStatus,
  BeastInterviewPrompt,
  BeastEventHandlers,
  BeastExecutionMode,
  BeastRunDetail,
  BeastRunSummary,
  BeastSseAgentEvent,
  BeastSseAgentStatusEvent,
  BeastSseRunEvent,
  BeastSseRunLogEvent,
  BeastSseRunStatusEvent,
  BeastSseSnapshot,
  ExtendedAgentCreateInput,
  ModuleConfig,
  TrackedAgentDetail,
  TrackedAgentEvent,
  TrackedAgentInitAction,
  TrackedAgentSummary,
} from '@franken/types';

export { MODULE_CONFIG_KEYS, TRACKED_AGENT_STATUSES } from '@franken/types';
export type {
  BeastCatalogEntry,
  BeastContainerRuntimeStatus,
  BeastInterviewPrompt,
  BeastEventHandlers,
  BeastExecutionMode,
  BeastRunDetail,
  BeastRunSummary,
  BeastSseAgentEvent,
  BeastSseAgentStatusEvent,
  BeastSseRunEvent,
  BeastSseRunLogEvent,
  BeastSseRunStatusEvent,
  BeastSseSnapshot,
  ExtendedAgentCreateInput,
  ModuleConfig,
  TrackedAgentDetail,
  TrackedAgentEvent,
  TrackedAgentInitAction,
  TrackedAgentSummary,
} from '@franken/types';

export class BeastApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BeastApiError';
  }
}

export class BeastApiClient {
  constructor(private readonly baseUrl: string) {}

  async getCatalog(): Promise<BeastCatalogEntry[]> {
    return this.request<BeastCatalogEntry[]>('/v1/beasts/catalog', { method: 'GET' });
  }

  async getContainerRuntimeStatus(): Promise<BeastContainerRuntimeStatus> {
    return this.request<BeastContainerRuntimeStatus>('/v1/beasts/runtime/container', { method: 'GET' });
  }

  async listRuns(): Promise<BeastRunSummary[]> {
    const body = await this.request<{ runs: BeastRunSummary[] }>('/v1/beasts/runs', { method: 'GET' });
    return body.runs;
  }

  async listAgents(): Promise<TrackedAgentSummary[]> {
    const body = await this.request<{ agents: TrackedAgentSummary[] }>('/v1/beasts/agents', { method: 'GET' });
    return body.agents;
  }

  async getRun(runId: string): Promise<Omit<BeastRunDetail, 'logs'> & { run: BeastRunSummary }> {
    return this.request(`/v1/beasts/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
  }

  async getAgent(agentId: string): Promise<TrackedAgentDetail> {
    return this.request(`/v1/beasts/agents/${encodeURIComponent(agentId)}`, { method: 'GET' });
  }

  async getLogs(runId: string): Promise<string[]> {
    const body = await this.request<{ logs: string[] }>(`/v1/beasts/runs/${encodeURIComponent(runId)}/logs`, { method: 'GET' });
    return body.logs;
  }

  async createRun(input: {
    definitionId: string;
    config: Record<string, unknown>;
    trackedAgentId?: string;
    executionMode?: BeastExecutionMode;
    startNow?: boolean;
    moduleConfig?: ModuleConfig;
  }): Promise<BeastRunSummary> {
    return this.request('/v1/beasts/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async createAgent(input: {
    definitionId: string;
    initAction: TrackedAgentInitAction;
    initConfig: Record<string, unknown>;
    chatSessionId?: string;
    moduleConfig?: ModuleConfig;
    executionMode?: BeastExecutionMode;
  }): Promise<TrackedAgentSummary> {
    return this.request('/v1/beasts/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async startRun(runId: string): Promise<BeastRunSummary> {
    return this.postAction(runId, 'start');
  }

  async stopRun(runId: string): Promise<BeastRunSummary> {
    return this.postAction(runId, 'stop');
  }

  async killRun(runId: string): Promise<BeastRunSummary> {
    return this.postAction(runId, 'kill');
  }

  async restartRun(runId: string): Promise<BeastRunSummary> {
    return this.postAction(runId, 'restart');
  }

  async startAgent(agentId: string): Promise<BeastRunSummary | TrackedAgentSummary> {
    return this.postAgentAction(agentId, 'start');
  }

  async stopAgent(agentId: string): Promise<BeastRunSummary | TrackedAgentSummary> {
    return this.postAgentAction(agentId, 'stop');
  }

  async restartAgent(agentId: string): Promise<BeastRunSummary | TrackedAgentSummary> {
    return this.postAgentAction(agentId, 'restart');
  }

  async resumeAgent(agentId: string): Promise<BeastRunSummary> {
    return this.request(`/v1/beasts/agents/${encodeURIComponent(agentId)}/resume`, {
      method: 'POST',
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.requestVoid(`/v1/beasts/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
    });
  }

  async killAgent(agentId: string): Promise<BeastRunSummary | TrackedAgentSummary> {
    return this.postAgentAction(agentId, 'kill');
  }

  async patchAgentConfig(agentId: string, config: Partial<ExtendedAgentCreateInput>): Promise<TrackedAgentSummary> {
    return this.request(`/v1/beasts/agents/${encodeURIComponent(agentId)}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async subscribeToEvents(handlers: BeastEventHandlers): Promise<() => void> {
    let closed = false;
    let eventSource: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let lastEventId: string | undefined;
    const parse = <T>(event: MessageEvent): T => JSON.parse(event.data) as T;
    const parseWithEventId = <T extends object>(event: MessageEvent): T & { eventId?: string } => {
      const parsed = parse<T>(event);
      return event.lastEventId ? { ...parsed, eventId: event.lastEventId } : parsed;
    };
    const rememberProcessedEventId = (event: MessageEvent): void => {
      if (event.lastEventId) lastEventId = event.lastEventId;
    };
    const handleEvent = <T>(
      event: MessageEvent,
      parsePayload: (event: MessageEvent) => T,
      handler: ((payload: T) => void) | undefined,
    ): void => {
      const payload = parsePayload(event);
      handler?.(payload);
      rememberProcessedEventId(event);
    };
    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect().catch((error: unknown) => {
          if (!closed) {
            handlers.error?.(toError(error));
            scheduleReconnect();
          }
        });
      }, 1_000);
    };

    const connect = async () => {
      const body = await this.requestRaw<{ ticket: string }>('/v1/beasts/events/ticket', { method: 'POST' });
      if (closed) return;
      eventSource?.close();
      const query = new URLSearchParams({ ticket: body.ticket });
      if (lastEventId) query.set('lastEventId', lastEventId);
      const nextSource = new EventSource(
        `${this.baseUrl}/v1/beasts/events/stream?${query.toString()}`,
      );
      eventSource = nextSource;

      nextSource.addEventListener('snapshot', (event) => {
        try {
          handleEvent(event as MessageEvent, parse<BeastSseSnapshot>, handlers.snapshot);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('agent.status', (event) => {
        try {
          handleEvent(event as MessageEvent, parse<BeastSseAgentStatusEvent>, handlers.agentStatus);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('agent.event', (event) => {
        try {
          handleEvent(event as MessageEvent, parse<BeastSseAgentEvent>, handlers.agentEvent);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('run.status', (event) => {
        try {
          handleEvent(event as MessageEvent, parse<BeastSseRunStatusEvent>, handlers.runStatus);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('run.log', (event) => {
        try {
          handleEvent(event as MessageEvent, parseWithEventId<BeastSseRunLogEvent>, handlers.runLog);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('run.event', (event) => {
        try {
          handleEvent(event as MessageEvent, parse<BeastSseRunEvent>, handlers.runEvent);
        } catch (error) {
          handlers.error?.(toError(error));
        }
      });
      nextSource.addEventListener('error', () => {
        if (closed) return;
        nextSource.close();
        handlers.error?.(new Error('Beast event stream disconnected; reconnecting'));
        scheduleReconnect();
      });
    };

    await connect().catch((error: unknown) => {
      if (!closed) {
        handlers.error?.(toError(error));
        scheduleReconnect();
      }
    });

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }

  private async postAction(runId: string, action: 'start' | 'stop' | 'kill' | 'restart'): Promise<BeastRunSummary> {
    return this.request(`/v1/beasts/runs/${encodeURIComponent(runId)}/${action}`, {
      method: 'POST',
    });
  }

  private async postAgentAction(
    agentId: string,
    action: 'start' | 'stop' | 'restart' | 'kill',
  ): Promise<BeastRunSummary | TrackedAgentSummary> {
    return this.request(`/v1/beasts/agents/${encodeURIComponent(agentId)}/${action}`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const body = await this.requestRaw<ApiDataEnvelope<T>>(path, init);
    return body.data;
  }

  private async requestRaw<T>(path: string, init: RequestInit): Promise<T> {
    const headers = normalizeHeaders(init.headers);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw await this.toError(response);
    }
    return response.json() as Promise<T>;
  }

  private async requestVoid(path: string, init: RequestInit): Promise<void> {
    const headers = normalizeHeaders(init.headers);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw await this.toError(response);
    }
  }

  private async toError(response: Response): Promise<BeastApiError> {
    const fallbackMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json() as ApiErrorEnvelope;
      const serverMessage = body.error?.message;
      if (serverMessage) {
        const code = body.error.code;
        const codeSuffix = code ? `, ${code}` : '';
        return new BeastApiError(
          `${serverMessage} (HTTP ${response.status}${codeSuffix})`,
          response.status,
          code,
          body.error.details,
        );
      }
    } catch {
      // Fall through with HTTP status message for empty, malformed, or non-JSON bodies.
    }
    return new BeastApiError(fallbackMessage, response.status);
  }
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
