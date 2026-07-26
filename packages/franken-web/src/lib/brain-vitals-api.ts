import type { BeastRunEvent, BeastRunSummary } from '@franken/types';
import { extractResponseErrorMessage, toError } from './http-error';

export interface BrainHealthSignals {
  taskSuccessRate: number;
  cacheHitRatio: number;
  compactionPressure: number;
  churnRatio: number;
  resourcePressure: number;
  budgetBurnRatio: number;
}

export interface BrainHealthSample {
  brainId: string;
  score: number;
  timestamp: number;
  signals: BrainHealthSignals;
  weights: BrainHealthSignals;
}

export interface BrainResourceSample {
  agentId: string;
  runId: string;
  pid: number;
  cpuPercent: number;
  rssBytes: number;
  estimatedWatts: number;
  estimatedEnergyWh: number;
  timestamp: number;
}

export interface BrainCompactionEvent {
  sessionId: string;
  runId: string;
  generation: number;
  triggerReason: string;
  tokensBefore: number;
  tokensAfter: number;
  timestamp: number;
}

export interface BrainTokenTotals {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  cacheHitRatio: number;
  estimatedUsd: number;
}

export interface BrainVitalsWindow {
  since: number;
  before: number;
  windowMs: number;
}

export interface BrainVitalsSnapshot {
  brainId: string;
  window: BrainVitalsWindow;
  health: BrainHealthSample;
  cache: {
    hitRatio: number;
    promptTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  compaction: { count: number; perHour: number; latestAt: number | null };
  churn: {
    spawnCount: number;
    spawnRatePerMinute: number;
    completed: number;
    failed: number;
    stopped: number;
    active: number;
    orphaned: number;
    ratio: number;
    runDurationMs: { count: number; p50: number | null; p95: number | null; min: number | null; max: number | null } | null;
  };
  resource: {
    availability: 'available' | 'unavailable';
    latest: BrainResourceSample | null;
    sampleCount: number;
    estimatedEnergyWh: number;
  };
  cost: { estimatedUsd: number; budgetUsd: number | null; burnRatio: number };
}

export interface BrainVitalsRunDetail {
  run: BeastRunSummary;
  churn: { classification: string };
  tokens: BrainTokenTotals;
  cost: { estimatedUsd: number; budgetUsd: number | null; burnRatio: number | null };
  compactions: BrainCompactionEvent[];
  resources: BrainResourceSample[];
  events: BeastRunEvent[];
  eventsTruncated: boolean;
}

export interface BrainVitalsActivity {
  dimension: 'cache' | 'compaction' | 'churn' | 'resource' | 'cost';
  kind: string;
  runId: string;
  timestamp: number;
}

export class BrainVitalsApiClient {
  constructor(private readonly baseUrl: string) {}

  async listRuns(limit = 100): Promise<{ runs: BeastRunSummary[]; nextCursor?: string }> {
    const response = await this.fetchJson<{ data: { runs: BeastRunSummary[]; nextCursor?: string } }>(
      `/v1/beasts/runs?limit=${limit}`,
    );
    return response.data;
  }

  async fetchSnapshot(brainId: string): Promise<BrainVitalsSnapshot> {
    const response = await this.fetchJson<{ data: BrainVitalsSnapshot }>(
      `/v1/brain-vitals/${encodeURIComponent(brainId)}`,
    );
    return response.data;
  }

  async fetchHistory(brainId: string, window = '1h'): Promise<{ data: BrainHealthSample[]; window: BrainVitalsWindow }> {
    return this.fetchJson(
      `/v1/brain-vitals/${encodeURIComponent(brainId)}/history?window=${encodeURIComponent(window)}`,
    );
  }

  async fetchRun(brainId: string, runId: string): Promise<BrainVitalsRunDetail> {
    const response = await this.fetchJson<{ data: BrainVitalsRunDetail }>(
      `/v1/brain-vitals/${encodeURIComponent(brainId)}/runs/${encodeURIComponent(runId)}`,
    );
    return response.data;
  }

  async subscribe(
    brainId: string,
    onSnapshot: (snapshot: BrainVitalsSnapshot) => void,
    onError?: (error: Error) => void,
    onActivity?: (activity: BrainVitalsActivity) => void,
  ): Promise<() => void> {
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect().catch((error) => {
          if (closed) return;
          onError?.(new Error(`Brain Vitals stream reconnect failed. ${toError(error).message}`));
          scheduleReconnect();
        });
      }, 1_000);
    };

    const connect = async () => {
      const path = `/v1/brain-vitals/${encodeURIComponent(brainId)}/events/ticket`;
      const ticketResponse = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!ticketResponse.ok) throw await responseError(ticketResponse);
      const { connectionId } = await ticketResponse.json() as { connectionId: string };
      if (closed) return;
      source?.close();
      source = new EventSource(
        `${this.baseUrl}/v1/brain-vitals/${encodeURIComponent(brainId)}/events/${encodeURIComponent(connectionId)}`,
        { withCredentials: true },
      );
      source.addEventListener('snapshot', (event) => {
        try {
          onSnapshot(JSON.parse((event as MessageEvent).data) as BrainVitalsSnapshot);
        } catch (error) {
          onError?.(new Error(`Brain Vitals snapshot could not be processed. ${toError(error).message}`));
        }
      });
      source.addEventListener('activity', (event) => {
        try {
          onActivity?.(JSON.parse((event as MessageEvent).data) as BrainVitalsActivity);
        } catch (error) {
          onError?.(new Error(`Brain Vitals activity could not be processed. ${toError(error).message}`));
        }
      });
      source.addEventListener('error', () => {
        if (closed) return;
        source?.close();
        source = undefined;
        onError?.(new Error('Brain Vitals stream connection lost. Reconnecting.'));
        scheduleReconnect();
      });
    };

    await connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<T>;
  }
}

async function responseError(response: Response): Promise<Error> {
  return new Error(await extractResponseErrorMessage(response) ?? `HTTP ${response.status}`);
}
