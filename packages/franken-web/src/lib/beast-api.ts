import { MODULE_CONFIG_KEYS } from '@franken/types';
import type {
  ApiDataEnvelope,
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

export { MODULE_CONFIG_KEYS } from '@franken/types';
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

export class BeastApiClient {
  constructor(
    private readonly baseUrl: string,
  ) {}

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
    const rememberEventId = (event: MessageEvent): void => {
      if (event.lastEventId) lastEventId = event.lastEventId;
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
        rememberEventId(event as MessageEvent);
        try { handlers.snapshot?.(parse<BeastSseSnapshot>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
      });
      nextSource.addEventListener('agent.status', (event) => {
        rememberEventId(event as MessageEvent);
        try { handlers.agentStatus?.(parse<BeastSseAgentStatusEvent>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
      });
      nextSource.addEventListener('agent.event', (event) => {
        rememberEventId(event as MessageEvent);
        try { handlers.agentEvent?.(parse<BeastSseAgentEvent>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
      });
      nextSource.addEventListener('run.status', (event) => {
        rememberEventId(event as MessageEvent);
        try { handlers.runStatus?.(parse<BeastSseRunStatusEvent>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
      });
      nextSource.addEventListener('run.log', (event) => {
        rememberEventId(event as MessageEvent);
        try { handlers.runLog?.(parseWithEventId<BeastSseRunLogEvent>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
      });
      nextSource.addEventListener('run.event', (event) => {
        rememberEventId(event as MessageEvent);
        try { handlers.runEvent?.(parse<BeastSseRunEvent>(event as MessageEvent)); } catch (error) { handlers.error?.(toError(error)); }
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async requestVoid(path: string, init: RequestInit): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
