export type AnalyticsSource = 'observer' | 'governor' | 'security' | 'cost' | 'beast';
export type AnalyticsOutcome = 'approved' | 'denied' | 'review_recommended' | 'failed' | 'error' | 'detected';
export type AnalyticsSeverity = 'info' | 'warning' | 'error';

export interface AnalyticsFilters {
  sessionId?: string;
  toolQuery?: string;
  outcome?: AnalyticsOutcome;
  timeWindow?: string;
}

export interface AnalyticsSummary {
  totalEvents: number;
  uniqueSessions: number;
  denialCount: number;
  errorCount: number;
  failureCount: number;
  securityDetectionCount: number;
  tokenTotals: {
    prompt: number;
    completion: number;
    total: number;
  };
  costTotals: {
    usd: number;
  };
}

export interface AnalyticsSessionOption {
  id: string;
  lastActivityAt: string;
  eventCount: number;
  failureCount: number;
}

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  sessionId?: string;
  toolName?: string;
  source: AnalyticsSource;
  category: string;
  outcome: AnalyticsOutcome;
  summary: string;
  severity: AnalyticsSeverity;
  raw: unknown;
  links: {
    runId?: string;
    agentId?: string;
  };
}

export interface AnalyticsEventPage {
  events: AnalyticsEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export class AnalyticsApiClient {
  constructor(private readonly baseUrl: string) {}

  async fetchSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary> {
    return this.fetchJson<AnalyticsSummary>(`/api/analytics/summary${queryString(filters)}`);
  }

  async fetchSessions(filters: AnalyticsFilters): Promise<AnalyticsSessionOption[]> {
    const response = await this.fetchJson<{ sessions: AnalyticsSessionOption[] }>(`/api/analytics/sessions${queryString(filters)}`);
    return response.sessions;
  }

  async fetchEvents(filters: AnalyticsFilters): Promise<AnalyticsEventPage> {
    return this.fetchJson<AnalyticsEventPage>(`/api/analytics/events${queryString(filters)}`);
  }

  async fetchEventDetail(id: string): Promise<AnalyticsEvent> {
    return this.fetchJson<AnalyticsEvent>(`/api/analytics/events/${encodeURIComponent(id)}`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

function queryString(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.toolQuery) params.set('toolQuery', filters.toolQuery);
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (filters.timeWindow) params.set('timeWindow', filters.timeWindow);
  const value = params.toString();
  return value ? `?${value}` : '';
}
