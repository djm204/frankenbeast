export interface BeastInterviewPrompt {
  key: string;
  prompt: string;
  kind: 'string' | 'boolean' | 'file' | 'directory';
  required?: boolean;
  options?: readonly string[];
}

export interface BeastCatalogEntry {
  id: string;
  version?: number;
  label: string;
  description: string;
  executionModeDefault: 'process' | 'container';
  interviewPrompts: BeastInterviewPrompt[];
}

export interface BeastRunSummary {
  id: string;
  trackedAgentId?: string;
  definitionId: string;
  status: string;
  dispatchedBy: string;
  dispatchedByUser: string;
  attemptCount: number;
  createdAt: string;
}

export interface BeastRunDetail {
  run: BeastRunSummary;
  attempts: Array<Record<string, unknown>>;
  events: Array<{ id: string; runId: string; sequence: number; type: string; payload: Record<string, unknown>; createdAt: string }>;
  logs: string[];
}

export interface TrackedAgentInitAction {
  kind: 'design-interview' | 'chunk-plan' | 'martin-loop';
  command: string;
  config: Record<string, unknown>;
  chatSessionId?: string;
}

export interface TrackedAgentSummary {
  id: string;
  definitionId: string;
  status: string;
  source: string;
  createdByUser: string;
  initAction: TrackedAgentInitAction;
  initConfig: Record<string, unknown>;
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

export class BeastApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly operatorToken: string,
  ) {}

  async getCatalog(): Promise<BeastCatalogEntry[]> {
    return this.request<BeastCatalogEntry[]>('/v1/beasts/catalog', { method: 'GET' });
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
    executionMode?: 'process' | 'container';
    startNow?: boolean;
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

  async resumeAgent(agentId: string): Promise<BeastRunSummary> {
    return this.request(`/v1/beasts/agents/${encodeURIComponent(agentId)}/resume`, {
      method: 'POST',
    });
  }

  private async postAction(runId: string, action: 'start' | 'stop' | 'kill' | 'restart'): Promise<BeastRunSummary> {
    return this.request(`/v1/beasts/runs/${encodeURIComponent(runId)}/${action}`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = normalizeHeaders(init.headers);
    headers.authorization = `Bearer ${this.operatorToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json() as { data: T };
    return body.data;
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
