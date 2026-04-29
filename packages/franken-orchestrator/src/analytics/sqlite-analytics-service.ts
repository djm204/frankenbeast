import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import type { AgentService } from '../beasts/services/agent-service.js';
import type { BeastRunService } from '../beasts/services/beast-run-service.js';
import type { BeastRun, TrackedAgent } from '../beasts/types.js';
import type {
  AnalyticsEvent,
  AnalyticsEventPage,
  AnalyticsFilters,
  AnalyticsOutcome,
  AnalyticsPageRequest,
  AnalyticsService,
  AnalyticsSessionOption,
  AnalyticsSeverity,
  AnalyticsSummary,
} from './types.js';

interface AuditRow {
  id: number;
  session_id: string;
  event_type: string;
  payload: string;
  created_at: string;
}

interface CostRow {
  id: number;
  session_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  created_at: string;
}

interface GovernorRow {
  id: number;
  action: string;
  context: string;
  decision: string;
  reason: string | null;
  created_at: string;
}

interface FirewallRow {
  id: number;
  input_hash: string;
  verdict: string;
  matched_patterns: string | null;
  created_at: string;
}

export interface SqliteAnalyticsServiceOptions {
  dbPath: string;
  runs?: BeastRunService | undefined;
  agents?: AgentService | undefined;
}

export function createSqliteAnalyticsService(options: SqliteAnalyticsServiceOptions): AnalyticsService {
  return new SqliteAnalyticsService(options);
}

class SqliteAnalyticsService implements AnalyticsService {
  constructor(private readonly options: SqliteAnalyticsServiceOptions) {}

  async getSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary> {
    const events = this.filteredEvents(filters);
    const costRows = this.readCostRows().filter((row) => matchesFilters(costRowToEvent(row), filters));
    const sessions = new Set(events.map((event) => event.sessionId).filter((id): id is string => Boolean(id)));
    const prompt = costRows.reduce((sum, row) => sum + row.prompt_tokens, 0);
    const completion = costRows.reduce((sum, row) => sum + row.completion_tokens, 0);

    return {
      totalEvents: events.length,
      uniqueSessions: sessions.size,
      denialCount: events.filter((event) => event.outcome === 'denied').length,
      errorCount: events.filter((event) => event.outcome === 'error').length,
      failureCount: events.filter((event) => event.outcome === 'failed').length,
      securityDetectionCount: events.filter((event) => event.outcome === 'detected').length,
      tokenTotals: {
        prompt,
        completion,
        total: prompt + completion,
      },
      costTotals: {
        usd: roundUsd(costRows.reduce((sum, row) => sum + row.cost_usd, 0)),
      },
    };
  }

  async listSessions(filters: AnalyticsFilters): Promise<AnalyticsSessionOption[]> {
    const events = this.filteredEvents({ ...filters, sessionId: undefined });
    const sessions = new Map<string, AnalyticsSessionOption>();

    for (const event of events) {
      if (!event.sessionId) {
        continue;
      }
      if (filters.sessionId && event.sessionId !== filters.sessionId) {
        continue;
      }

      const current = sessions.get(event.sessionId) ?? {
        id: event.sessionId,
        lastActivityAt: event.timestamp,
        eventCount: 0,
        failureCount: 0,
      };

      current.eventCount += 1;
      if (isAbnormal(event.outcome)) {
        current.failureCount += 1;
      }
      if (compareTimestampsDesc(event.timestamp, current.lastActivityAt) < 0) {
        current.lastActivityAt = event.timestamp;
      }
      sessions.set(event.sessionId, current);
    }

    return [...sessions.values()].sort((a, b) => compareTimestampsDesc(a.lastActivityAt, b.lastActivityAt));
  }

  async listEvents(request: AnalyticsPageRequest): Promise<AnalyticsEventPage> {
    const page = Math.max(1, request.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, request.pageSize ?? 50));
    const events = this.filteredEvents(request);
    const start = (page - 1) * pageSize;

    return {
      events: events.slice(start, start + pageSize),
      total: events.length,
      page,
      pageSize,
    };
  }

  async getEvent(id: string): Promise<AnalyticsEvent | null> {
    return this.allEvents().find((event) => event.id === id) ?? null;
  }

  private filteredEvents(filters: AnalyticsFilters): AnalyticsEvent[] {
    return this.allEvents()
      .filter((event) => matchesFilters(event, filters))
      .sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
  }

  private allEvents(): AnalyticsEvent[] {
    const events = [
      ...this.readAuditRows().map(auditRowToEvent),
      ...this.readCostRows().map(costRowToEvent),
      ...this.readGovernorRows().map(governorRowToEvent),
      ...this.readFirewallRows().map(firewallRowToEvent),
      ...this.readBeastEvents(),
    ];

    return events.sort((a, b) => compareTimestampsDesc(a.timestamp, b.timestamp));
  }

  private readAuditRows(): AuditRow[] {
    return this.readRows<AuditRow>('audit_trail', `
      SELECT id, session_id, event_type, payload, created_at
      FROM audit_trail
    `);
  }

  private readCostRows(): CostRow[] {
    return this.readRows<CostRow>('cost_ledger', `
      SELECT id, session_id, model, prompt_tokens, completion_tokens, cost_usd, created_at
      FROM cost_ledger
    `);
  }

  private readGovernorRows(): GovernorRow[] {
    return this.readRows<GovernorRow>('governor_log', `
      SELECT id, action, context, decision, reason, created_at
      FROM governor_log
    `);
  }

  private readFirewallRows(): FirewallRow[] {
    return this.readRows<FirewallRow>('firewall_log', `
      SELECT id, input_hash, verdict, matched_patterns, created_at
      FROM firewall_log
    `);
  }

  private readRows<T>(table: string, sql: string): T[] {
    if (!existsSync(this.options.dbPath)) {
      return [];
    }

    const db = new Database(this.options.dbPath, { readonly: true, fileMustExist: true });
    try {
      if (!hasTable(db, table)) {
        return [];
      }
      return db.prepare(sql).all() as T[];
    } finally {
      db.close();
    }
  }

  private readBeastEvents(): AnalyticsEvent[] {
    const runs = this.options.runs?.listRuns() ?? [];
    const agents = new Map<string, TrackedAgent>();
    for (const agent of this.options.agents?.listAgents() ?? []) {
      agents.set(agent.id, agent);
    }

    return runs
      .filter((run) => run.status === 'failed')
      .map((run) => beastRunToEvent(run, run.trackedAgentId ? agents.get(run.trackedAgentId) : undefined));
  }
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function auditRowToEvent(row: AuditRow): AnalyticsEvent {
  const raw = parseJson(row.payload);
  const toolName = readString(raw, ['toolName', 'tool', 'tool_name', 'action']);
  const outcome = inferObserverOutcome(row.event_type, raw);
  return {
    id: `audit:${row.id}`,
    timestamp: row.created_at,
    sessionId: row.session_id,
    ...(toolName ? { toolName } : {}),
    source: 'observer',
    category: readString(raw, ['phase', 'category']) ?? row.event_type,
    outcome,
    summary: readString(raw, ['summary', 'reason', 'error', 'message']) ?? row.event_type,
    severity: severityFor(outcome),
    raw,
    links: {},
  };
}

function costRowToEvent(row: CostRow): AnalyticsEvent {
  return {
    id: `cost:${row.id}`,
    timestamp: row.created_at,
    sessionId: row.session_id,
    toolName: row.model,
    source: 'cost',
    category: 'usage',
    outcome: 'approved',
    summary: `${row.prompt_tokens + row.completion_tokens} tokens on ${row.model}`,
    severity: 'info',
    raw: {
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      costUsd: row.cost_usd,
    },
    links: {},
  };
}

function governorRowToEvent(row: GovernorRow): AnalyticsEvent {
  const context = parseJson(row.context);
  const outcome = normalizeOutcome(row.decision);
  const sessionId = readString(context, ['sessionId', 'session_id']);
  const toolName = readString(context, ['toolName', 'tool', 'tool_name']) ?? row.action;

  return {
    id: `governor:${row.id}`,
    timestamp: row.created_at,
    ...(sessionId ? { sessionId } : {}),
    ...(toolName ? { toolName } : {}),
    source: 'governor',
    category: 'decision',
    outcome,
    summary: row.reason ?? row.decision,
    severity: severityFor(outcome),
    raw: {
      action: row.action,
      context,
      decision: row.decision,
      reason: row.reason,
    },
    links: {},
  };
}

function firewallRowToEvent(row: FirewallRow): AnalyticsEvent {
  const detected = row.verdict !== 'clean' && row.verdict !== 'allowed';
  const raw = {
    inputHash: row.input_hash,
    verdict: row.verdict,
    matchedPatterns: parseJson(row.matched_patterns ?? '[]'),
  };

  return {
    id: `security:${row.id}`,
    timestamp: row.created_at,
    source: 'security',
    category: 'injection',
    outcome: detected ? 'detected' : 'approved',
    summary: detected ? `Security detection: ${row.verdict}` : `Security scan: ${row.verdict}`,
    severity: detected ? 'warning' : 'info',
    raw,
    links: {},
  };
}

function beastRunToEvent(run: BeastRun, agent: TrackedAgent | undefined): AnalyticsEvent {
  return {
    id: `beast-run:${run.id}`,
    timestamp: run.finishedAt ?? run.startedAt ?? run.createdAt,
    ...(agent?.chatSessionId ? { sessionId: agent.chatSessionId } : {}),
    toolName: run.definitionId,
    source: 'beast',
    category: 'run',
    outcome: 'failed',
    summary: `Beast run ${run.id} failed with exit code ${run.latestExitCode ?? 'unknown'}`,
    severity: 'error',
    raw: run,
    links: {
      runId: run.id,
      ...(run.trackedAgentId ? { agentId: run.trackedAgentId } : {}),
    },
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function inferObserverOutcome(eventType: string, raw: unknown): AnalyticsOutcome {
  const text = `${eventType} ${JSON.stringify(raw)}`.toLowerCase();
  if (text.includes('injection') || text.includes('security') || text.includes('detected')) return 'detected';
  if (text.includes('error')) return 'error';
  if (text.includes('fail')) return 'failed';
  if (text.includes('denied') || text.includes('reject')) return 'denied';
  return 'approved';
}

function normalizeOutcome(value: string): AnalyticsOutcome {
  if (value === 'denied') return 'denied';
  if (value === 'review_recommended') return 'review_recommended';
  if (value === 'failed') return 'failed';
  if (value === 'error') return 'error';
  if (value === 'detected') return 'detected';
  return 'approved';
}

function severityFor(outcome: AnalyticsOutcome): AnalyticsSeverity {
  if (outcome === 'denied' || outcome === 'failed' || outcome === 'error') return 'error';
  if (outcome === 'review_recommended' || outcome === 'detected') return 'warning';
  return 'info';
}

function isAbnormal(outcome: AnalyticsOutcome): boolean {
  return outcome !== 'approved';
}

function matchesFilters(event: AnalyticsEvent, filters: AnalyticsFilters): boolean {
  if (filters.sessionId && event.sessionId !== filters.sessionId) {
    return false;
  }
  if (filters.outcome && event.outcome !== filters.outcome) {
    return false;
  }
  if (filters.toolQuery) {
    const query = filters.toolQuery.toLowerCase();
    const haystack = `${event.toolName ?? ''} ${event.summary} ${event.category} ${event.source}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }
  const cutoff = cutoffFor(filters.timeWindow);
  if (cutoff && parseAnalyticsTimestamp(event.timestamp) < cutoff.getTime()) {
    return false;
  }
  return true;
}

function compareTimestampsDesc(left: string, right: string): number {
  const delta = parseAnalyticsTimestamp(right) - parseAnalyticsTimestamp(left);
  return delta === 0 ? right.localeCompare(left) : delta;
}

function parseAnalyticsTimestamp(timestamp: string): number {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(timestamp)
    ? `${timestamp.replace(' ', 'T')}Z`
    : timestamp;
  return Date.parse(normalized);
}

function cutoffFor(timeWindow: string | undefined): Date | null {
  if (!timeWindow || timeWindow === 'all') {
    return null;
  }
  const match = /^(\d+)([hd])$/.exec(timeWindow);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const milliseconds = unit === 'h' ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - milliseconds);
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}
