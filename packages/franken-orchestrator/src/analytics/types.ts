export type AnalyticsSource = 'observer' | 'governor' | 'security' | 'cost' | 'beast';
export type AnalyticsOutcome = 'approved' | 'denied' | 'review_recommended' | 'failed' | 'error' | 'detected';
export type AnalyticsSeverity = 'info' | 'warning' | 'error';

export interface AnalyticsFilters {
  sessionId?: string | undefined;
  toolQuery?: string | undefined;
  outcome?: AnalyticsOutcome | undefined;
  timeWindow?: string | undefined;
}

export interface AnalyticsPageRequest extends AnalyticsFilters {
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface AnalyticsTokenTotals {
  prompt: number;
  completion: number;
  total: number;
}

export interface AnalyticsCostTotals {
  usd: number;
}

export interface AnalyticsSummary {
  totalEvents: number;
  uniqueSessions: number;
  denialCount: number;
  errorCount: number;
  failureCount: number;
  securityDetectionCount: number;
  tokenTotals: AnalyticsTokenTotals;
  costTotals: AnalyticsCostTotals;
}

export interface AnalyticsLinks {
  runId?: string | undefined;
  agentId?: string | undefined;
}

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  sessionId?: string | undefined;
  toolName?: string | undefined;
  source: AnalyticsSource;
  category: string;
  outcome: AnalyticsOutcome;
  summary: string;
  severity: AnalyticsSeverity;
  raw: unknown;
  links: AnalyticsLinks;
}

export interface AnalyticsEventPage {
  events: AnalyticsEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AnalyticsSessionOption {
  id: string;
  lastActivityAt: string;
  eventCount: number;
  failureCount: number;
}

export interface AnalyticsService {
  getSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary>;
  listSessions(filters: AnalyticsFilters): Promise<AnalyticsSessionOption[]>;
  listEvents(request: AnalyticsPageRequest): Promise<AnalyticsEventPage>;
  getEvent(id: string): Promise<AnalyticsEvent | null>;
}
