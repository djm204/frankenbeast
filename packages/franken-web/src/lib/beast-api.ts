export interface BeastInterviewPrompt {
  key: string;
  prompt: string;
  kind: 'string' | 'boolean' | 'file' | 'directory';
  required?: boolean;
  options?: readonly string[];
}

export type BeastExecutionMode = 'process' | 'container';

export interface BeastContainerRuntimeStatus {
  available: boolean;
  reason?: string;
}

export interface BeastCatalogEntry {
  id: string;
  version?: number;
  label: string;
  description: string;
  executionModeDefault: BeastExecutionMode;
  containerRuntime?: BeastContainerRuntimeStatus;
  interviewPrompts: BeastInterviewPrompt[];
}

export interface BeastRunSummary {
  id: string;
  trackedAgentId?: string;
  definitionId: string;
  status: string;
  executionMode: 'process' | 'container';
  dispatchedBy: string;
  dispatchedByUser: string;
  attemptCount: number;
  currentAttemptId?: string;
  stopReason?: string;
  containerId?: string;
  containerName?: string;
  containerRuntime?: string;
  image?: string;
  containerImage?: string;
  containerNetwork?: string;
  resourceSnapshot?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  workspaceHostPath?: string;
  workspaceContainerPath?: string;
  createdAt: string;
}

export interface BeastRunDetail {
  run: BeastRunSummary;
  attempts: Array<Record<string, unknown>>;
  events: Array<{ id: string; runId: string; sequence: number; type: string; payload: Record<string, unknown>; createdAt: string }>;
  logs: string[];
}

export interface BeastSseSnapshot {
  agents?: Array<Partial<TrackedAgentSummary> & { id: string }>;
}

export interface BeastSseAgentStatusEvent {
  agentId: string;
  status: string;
  updatedAt?: string;
}

export interface BeastSseAgentEvent {
  agentId: string;
  event: Omit<TrackedAgentEvent, 'id' | 'agentId' | 'sequence'> & Partial<TrackedAgentEvent>;
}

export interface BeastSseRunStatusEvent {
  runId: string;
  status: string;
  updatedAt?: string;
}

export interface BeastSseRunLogEvent {
  eventId?: string;
  runId: string;
  attemptId?: string;
  stream?: 'stdout' | 'stderr';
  line: string;
  createdAt?: string;
}

export interface BeastSseRunEvent {
  runId: string;
  event: Record<string, unknown>;
}

export interface BeastEventHandlers {
  snapshot?: (snapshot: BeastSseSnapshot) => void;
  agentStatus?: (event: BeastSseAgentStatusEvent) => void;
  agentEvent?: (event: BeastSseAgentEvent) => void;
  runStatus?: (event: BeastSseRunStatusEvent) => void;
  runLog?: (event: BeastSseRunLogEvent) => void;
  runEvent?: (event: BeastSseRunEvent) => void;
  error?: (error: Error) => void;
}

export interface TrackedAgentInitAction {
  kind: 'design-interview' | 'chunk-plan' | 'martin-loop';
  command: string;
  config: Record<string, unknown>;
  chatSessionId?: string;
}

export interface ModuleConfig {
  firewall?: boolean;
  skills?: boolean;
  memory?: boolean;
  planner?: boolean;
  critique?: boolean;
  governor?: boolean;
  heartbeat?: boolean;
}

export const MODULE_CONFIG_KEYS: readonly (keyof ModuleConfig)[] = [
  'firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat',
] as const;

export interface TrackedAgentSummary {
  id: string;
  name?: string;
  definitionId: string;
  status: string;
  source: string;
  createdByUser: string;
  initAction: TrackedAgentInitAction;
  initConfig: Record<string, unknown>;
  moduleConfig?: ModuleConfig;
  executionMode?: BeastExecutionMode;
  chatSessionId?: string;
  dispatchRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedAgentEvent {
  id: string;
  agentId: string;
  sequence: number;
  level: 'info' | 'warning' | 'error';
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TrackedAgentDetail {
  agent: TrackedAgentSummary;
  events: TrackedAgentEvent[];
}

export interface AgentLlmConfig {
  default?: { provider: string; model: string };
  overrides?: Record<string, { provider: string; model: string }>;
}

export interface AgentGitConfig {
  preset: 'one-shot' | 'feature-branch' | 'feature-branch-worktree' | 'yolo-main' | 'custom';
  baseBranch: string;
  branchPattern: string;
  prCreation: boolean;
  prTemplate?: string;
  commitConvention: 'conventional' | 'freeform';
  mergeStrategy: 'merge' | 'squash' | 'rebase';
}

export interface AgentDeepModuleConfig {
  firewall?: { ruleSet?: string; customRules?: string };
  memory?: { backend?: string; retentionPolicy?: string };
  planner?: { maxDagDepth?: number; parallelTaskLimit?: number };
  critique?: { maxIterations?: number; severityThreshold?: string };
  governor?: { approvalMode?: string; escalationRules?: string };
  heartbeat?: { reflectionInterval?: number; llmOverride?: { provider: string; model: string } };
}

export interface ExtendedAgentCreateInput {
  name: string;
  description?: string;
  definitionId: string;
  initAction: TrackedAgentInitAction;
  moduleConfig?: ModuleConfig;
  deepModuleConfig?: AgentDeepModuleConfig;
  llmConfig?: AgentLlmConfig;
  gitConfig?: AgentGitConfig;
  skills?: string[];
  promptText?: string;
  promptFiles?: Array<{ name: string; content: string; tokens: number }>;
}

export class BeastApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken: string,
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
    const body = await this.requestRaw<{ data: T }>(path, init);
    return body.data;
  }

  private async requestRaw<T>(path: string, init: RequestInit): Promise<T> {
    const headers = normalizeHeaders(init.headers);
    headers.authorization = `Bearer ${this.operatorToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async requestVoid(path: string, init: RequestInit): Promise<void> {
    const headers = normalizeHeaders(init.headers);
    headers.authorization = `Bearer ${this.operatorToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
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
