import {
  BrainHealthScorer,
  DEFAULT_BRAIN_HEALTH_WEIGHTS,
  calculateBrainHealthScore,
  cacheHitRatio,
  type BrainHealthSample,
  type BrainHealthSampleAdapter,
  type BrainHealthWeights,
  type CompactionEvent,
  type CostCalculator,
  type ProcessResourceSample,
  type Trace,
  type TraceSummary,
} from '@franken/observer';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';

import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import {
  InMemoryRateLimiter,
  requireBeastRateLimit,
  type BeastRateLimitOptions,
} from '../../beasts/http/beast-rate-limit.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { BeastLifecycleMetrics } from '../../beasts/telemetry/beast-lifecycle-metrics.js';
import type { BeastRun, BeastRunEvent } from '../../beasts/types.js';
import { redactAbsoluteHostPathValues } from '../beast-response-redaction.js';
import { TransportSecurityService } from '../security/transport-security.js';

const DEFAULT_WINDOW_MS = 60 * 60 * 1_000;
const MAX_OBSERVER_ROWS = 1_000;
const SNAPSHOT_POLL_MS = 1_000;
const HEARTBEAT_MS = 30_000;
const HEALTH_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const HEALTH_HISTORY_SAMPLE_MS = 60_000;
const RESOURCE_RETENTION_MS = 24 * 60 * 60 * 1_000;
const RUN_EVENT_LIMIT = 100;
const SNAPSHOT_RUN_LIMIT = 200;
const BRAIN_VITALS_SSE_TICKET_COOKIE = 'frankenbeast_brain_vitals_sse_ticket';

interface BrainVitalsObserver extends BrainHealthSampleAdapter {
  deleteHealthScoresBefore(before: number): Promise<number>;
  deleteResourceSamplesBefore(before: number): Promise<number>;
  flush(trace: Trace): Promise<void>;
  recordCompaction(event: CompactionEvent): Promise<void>;
  recordResourceSample(sample: ProcessResourceSample): Promise<void>;
  queryByTraceId(traceId: string): Promise<Trace | null>;
  listTraceSummaries?(): Promise<TraceSummary[]>;
  queryCompactions(query: (
    | { sessionId: string; runId?: never }
    | { runId: string; sessionId?: never }
  ) & { since?: number; limit: number }): Promise<CompactionEvent[]>;
  queryResourceSamples(query: {
    runId?: string;
    agentId?: string;
    since?: number;
    before?: number;
    limit?: number;
  }): Promise<ProcessResourceSample[]>;
}

interface BrainVitalsRunStore {
  listRuns(): BeastRun[];
  listRunsForDefinitionWindow?(options: {
    definitionId: string;
    since: string;
    limit: number;
  }): BeastRun[];
  getRun(runId: string): BeastRun | undefined;
  listEvents?(runId: string, options?: { limit?: number }): BeastRunEvent[];
  listEventPageForResponse?(runId: string, afterSequence: number, limit: number): {
    events: BeastRunEvent[];
    page: { hasMore: boolean };
  };
  sanitizeRunForResponse?(run: BeastRun | undefined): BeastRun | undefined;
}

export interface BrainVitalsServiceOptions {
  observer: BrainVitalsObserver;
  runs: BrainVitalsRunStore;
  eventBus: BeastEventBus;
  costCalculator: CostCalculator;
  lifecycleMetrics: BeastLifecycleMetrics;
  now?: (() => number) | undefined;
}

interface TokenAndCostTotals {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly totalTokens: number;
  readonly cacheHitRatio: number;
  readonly estimatedUsd: number;
}

interface ActivityFingerprint {
  readonly promptTokens: number;
  readonly cacheReadTokens: number;
  readonly budgetBurnRatio: number;
  readonly resourcePressure: number;
  readonly resourceTimestamp: number | null;
}

export class BrainVitalsService {
  private readonly health: BrainHealthScorer;
  private readonly now: () => number;
  private readonly seenCompactions = new Map<string, Set<string>>();
  private readonly directlyPublishedCompactions = new Set<string>();
  private readonly activityFingerprints = new Map<string, ActivityFingerprint>();
  private readonly directResourcePressure = new Map<string, number>();
  private readonly directBudgetBurn = new Map<string, number>();
  private readonly lastPersistedHealthAt = new Map<string, number>();
  private lastHealthPruneAt = Number.NEGATIVE_INFINITY;
  private lastResourcePruneAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: BrainVitalsServiceOptions) {
    this.health = new BrainHealthScorer(options.observer);
    this.now = options.now ?? Date.now;
  }

  async snapshot(brainId: string, windowMs = DEFAULT_WINDOW_MS) {
    brainId = normalizeBrainId(brainId);
    const now = this.now();
    const since = now - windowMs;
    if (now - this.lastResourcePruneAt >= HEALTH_HISTORY_SAMPLE_MS) {
      await this.options.observer.deleteResourceSamplesBefore(now - RESOURCE_RETENTION_MS);
      this.lastResourcePruneAt = now;
    }
    const runs = this.options.runs.listRunsForDefinitionWindow?.({
      definitionId: brainId,
      since: new Date(since).toISOString(),
      limit: SNAPSHOT_RUN_LIMIT,
    }) ?? this.options.runs.listRuns()
      .filter((run) => run.definitionId === brainId)
      .filter((run) => (
        run.status === 'queued'
        || run.status === 'running'
        || latestRunActivityAt(run) >= since
      ))
      .slice(0, SNAPSHOT_RUN_LIMIT);
    const lifecycle = this.options.lifecycleMetrics.query({
      from: new Date(since).toISOString(),
      to: new Date(now).toISOString(),
    });
    const lifecycleAggregate = lifecycle.definitions.find((value) => value.definitionId === brainId);
    let traceSummaries: Promise<TraceSummary[]> | undefined;
    const getTraceSummaries = this.options.observer.listTraceSummaries
      ? () => traceSummaries ??= this.options.observer.listTraceSummaries!()
      : undefined;
    const details = await Promise.all(
      runs.map((run) => this.readRunTelemetry(run, since, now, getTraceSummaries)),
    );
    const tokenTotals = sumTokenTotals(details.map((detail) => detail.tokens));
    const compactions = details.flatMap((detail) => detail.compactions);
    const resources = details.flatMap((detail) => detail.resources)
      .sort((left, right) => left.timestamp - right.timestamp);
    const latestResource = resources.at(-1) ?? null;
    const completed = lifecycleAggregate?.completionCount
      ?? runs.filter((run) => run.status === 'completed').length;
    const failed = lifecycleAggregate?.failureCount
      ?? runs.filter((run) => run.status === 'failed').length;
    const stopped = lifecycleAggregate?.stopCount
      ?? runs.filter((run) => run.status === 'stopped').length;
    const terminal = completed + failed + stopped;
    const spawnCount = lifecycleAggregate?.spawnCount ?? runs.length;
    const active = lifecycleAggregate?.activeCount ?? runs.length - terminal;
    // Orphan sweeps are process-global and cannot be attributed to one definition.
    const orphaned = 0;
    const budgetUsd = sumBudgets(runs);
    const burnRatio = budgetUsd === null ? 0 : clamp(tokenTotals.estimatedUsd / budgetUsd);
    const churnRatio = spawnCount + orphaned === 0
      ? 0
      : clamp((failed + stopped + orphaned) / (spawnCount + orphaned));
    const resourceAvailable = latestResource !== null;
    const currentResourcePressure = resourceAvailable ? resourcePressure(latestResource) : 0;
    const signals = {
      taskSuccessRate: lifecycleAggregate?.completionRate
        ?? (terminal === 0 ? 0 : completed / terminal),
      cacheHitRatio: tokenTotals.cacheHitRatio,
      compactionPressure: clamp(compactions.length / 10),
      churnRatio,
      resourcePressure: currentResourcePressure,
      budgetBurnRatio: burnRatio,
    };
    const health = await this.healthSample(
      brainId,
      signals,
      now,
      resourceAvailable ? DEFAULT_BRAIN_HEALTH_WEIGHTS : WITHOUT_RESOURCE_HEALTH_WEIGHTS,
    );
    this.publishNewCompactions(brainId, compactions);
    this.publishSignalChanges(runs, details, now);

    return {
      brainId,
      window: { since, before: now, windowMs },
      health,
      cache: {
        hitRatio: tokenTotals.cacheHitRatio,
        promptTokens: tokenTotals.promptTokens,
        cacheReadTokens: tokenTotals.cacheReadTokens,
        cacheCreationTokens: tokenTotals.cacheCreationTokens,
      },
      compaction: {
        count: compactions.length,
        perHour: compactions.length * (3_600_000 / windowMs),
        latestAt: compactions.reduce<number | null>(
          (latest, event) => latest === null || event.timestamp > latest ? event.timestamp : latest,
          null,
        ),
      },
      churn: {
        spawnCount,
        spawnRatePerMinute: lifecycleAggregate?.spawnRatePerMinute ?? 0,
        completed,
        failed,
        stopped,
        active,
        orphaned,
        ratio: churnRatio,
        runDurationMs: lifecycleAggregate?.runDurationMs ?? null,
      },
      resource: {
        availability: resourceAvailable ? 'available' : 'unavailable',
        latest: latestResource,
        sampleCount: resources.length,
        estimatedEnergyWh: resources.reduce((total, sample) => total + sample.estimatedEnergyWh, 0),
      },
      cost: {
        estimatedUsd: tokenTotals.estimatedUsd,
        budgetUsd,
        burnRatio,
      },
    };
  }

  getHistory(brainId: string, options: { since?: number; before?: number; limit?: number } = {}): Promise<BrainHealthSample[]> {
    return this.health.getHealthHistory(brainId, options);
  }

  async historyWindow(brainId: string, windowMs: number) {
    const before = this.now();
    const since = before - windowMs;
    return {
      data: await this.getHistory(brainId, { since, before, limit: MAX_OBSERVER_ROWS }),
      window: { windowMs, since, before },
    };
  }

  async recordCompaction(event: CompactionEvent): Promise<void> {
    await this.options.observer.recordCompaction(event);
    this.directlyPublishedCompactions.add(compactionKey(event));
    this.publishActivityForRun(
      event.runId,
      'compaction',
      'compaction.completed',
      event.timestamp,
      event.sessionId,
    );
  }

  async recordResourceSample(sample: ProcessResourceSample): Promise<void> {
    await this.options.observer.recordResourceSample(sample);
    const currentPressure = resourcePressure(sample);
    const previousPressure = this.directResourcePressure.get(sample.runId) ?? 0;
    this.directResourcePressure.set(sample.runId, currentPressure);
    if (previousPressure < 0.8 && currentPressure >= 0.8) {
      this.publishActivityForRun(
        sample.runId,
        'resource',
        'resource.threshold_crossed',
        sample.timestamp,
      );
    }
  }

  async recordTrace(runId: string, trace: Trace, timestamp = this.now()): Promise<void> {
    await this.options.observer.flush(trace);
    const tokens = traceTokenTotals(trace, this.options.costCalculator);
    if (tokens.promptTokens > 0) {
      this.publishActivityForRun(
        runId,
        'cache',
        tokens.cacheReadTokens > 0 ? 'cache.hit' : 'cache.miss',
        timestamp,
      );
    }
    const run = this.options.runs.getRun(runId);
    const budgetUsd = run ? readBudget(run) : null;
    if (budgetUsd !== null) {
      const burnRatio = clamp(tokens.estimatedUsd / budgetUsd);
      const previousBurn = this.directBudgetBurn.get(runId) ?? 0;
      this.directBudgetBurn.set(runId, burnRatio);
      const kind = crossedBudgetThreshold(previousBurn, burnRatio);
      if (kind) this.publishActivityForRun(runId, 'cost', kind, timestamp);
    }
  }

  async runDetails(brainId: string, runId: string) {
    brainId = normalizeBrainId(brainId);
    const run = this.options.runs.getRun(runId);
    if (!run || run.definitionId !== brainId) return null;
    const telemetry = await this.readRunTelemetry(run, 0, Number.MAX_SAFE_INTEGER);
    const budgetUsd = readBudget(run);
    const eventPage = this.options.runs.listEventPageForResponse?.(run.id, 0, RUN_EVENT_LIMIT);
    const fallbackEvents = eventPage === undefined
      ? this.options.runs.listEvents?.(run.id, { limit: RUN_EVENT_LIMIT + 1 }) ?? []
      : [];
    const events = eventPage?.events ?? fallbackEvents.slice(0, RUN_EVENT_LIMIT);
    const responseRun = this.options.runs.sanitizeRunForResponse?.(run) ?? run;
    return {
      run: redactAbsoluteHostPathValues(responseRun) as BeastRun,
      churn: { classification: classifyRun(run) },
      tokens: telemetry.tokens,
      cost: {
        estimatedUsd: telemetry.tokens.estimatedUsd,
        budgetUsd,
        burnRatio: budgetUsd === null ? null : clamp(telemetry.tokens.estimatedUsd / budgetUsd),
      },
      compactions: telemetry.compactions,
      resources: telemetry.resources,
      events: events.map((event) => redactAbsoluteHostPathValues(event) as BeastRunEvent),
      eventsTruncated: eventPage?.page.hasMore ?? fallbackEvents.length > RUN_EVENT_LIMIT,
    };
  }

  private async readRunTelemetry(
    run: BeastRun,
    since: number,
    before: number,
    getTraceSummaries?: () => Promise<readonly TraceSummary[]>,
  ) {
    const [trace, compactions, resources] = await Promise.all([
      this.findRunTrace(run.id, getTraceSummaries),
      this.options.observer.queryCompactions({ runId: run.id, since, limit: MAX_OBSERVER_ROWS }),
      this.options.observer.queryResourceSamples({ runId: run.id, since, before, limit: MAX_OBSERVER_ROWS }),
    ]);
    return {
      tokens: traceTokenTotals(trace, this.options.costCalculator, since, before),
      // sessionId is the stable Beast run id. Compaction runId is the observer
      // trace id for older writers, so filtering by it would hide real records.
      compactions: compactions.filter((event) => event.timestamp <= before),
      resources,
    };
  }

  private async findRunTrace(
    runId: string,
    getTraceSummaries?: () => Promise<readonly TraceSummary[]>,
  ): Promise<Trace | null> {
    const direct = await this.options.observer.queryByTraceId(runId);
    if (direct || !this.options.observer.listTraceSummaries) return direct;
    const summaries = getTraceSummaries
      ? await getTraceSummaries()
      : await this.options.observer.listTraceSummaries();
    const matching = summaries
      .filter((summary) => summary.goal === runId)
      .sort((left, right) => right.startedAt - left.startedAt)[0];
    return matching ? this.options.observer.queryByTraceId(matching.id) : null;
  }

  private publishActivityForRun(
    runId: string,
    dimension: 'cache' | 'compaction' | 'churn' | 'resource' | 'cost',
    kind: string,
    timestamp: number,
    fallbackRunId?: string,
  ): void {
    const run = this.options.runs.getRun(runId)
      ?? (fallbackRunId ? this.options.runs.getRun(fallbackRunId) : undefined);
    if (!run) return;
    this.options.eventBus.publish({
      type: 'brain-vitals.activity',
      data: { brainId: run.definitionId, dimension, kind, runId: run.id, timestamp },
    });
  }

  private publishNewCompactions(brainId: string, events: readonly CompactionEvent[]): void {
    const current = new Set(events.map(compactionKey));
    const previous = this.seenCompactions.get(brainId);
    this.seenCompactions.set(brainId, current);
    if (!previous) return;
    for (const event of events) {
      const key = compactionKey(event);
      if (previous.has(key)) continue;
      if (this.directlyPublishedCompactions.delete(key)) continue;
      this.publishActivityForRun(
        event.runId,
        'compaction',
        'compaction.completed',
        event.timestamp,
        event.sessionId,
      );
    }
  }

  private publishSignalChanges(
    runs: readonly BeastRun[],
    details: readonly { tokens: TokenAndCostTotals; resources: readonly ProcessResourceSample[] }[],
    timestamp: number,
  ): void {
    for (const [index, run] of runs.entries()) {
      const telemetry = details[index];
      if (!telemetry) continue;
      const latestResource = telemetry.resources.at(0) ?? null;
      const budget = readBudget(run);
      const current: ActivityFingerprint = {
        promptTokens: telemetry.tokens.promptTokens,
        cacheReadTokens: telemetry.tokens.cacheReadTokens,
        budgetBurnRatio: budget === null ? 0 : clamp(telemetry.tokens.estimatedUsd / budget),
        resourcePressure: latestResource ? resourcePressure(latestResource) : 0,
        resourceTimestamp: latestResource?.timestamp ?? null,
      };
      const previous = this.activityFingerprints.get(run.id);
      this.activityFingerprints.set(run.id, current);
      if (!previous) continue;
      if (current.promptTokens > previous.promptTokens) {
        const cacheKind = current.cacheReadTokens > previous.cacheReadTokens ? 'cache.hit' : 'cache.miss';
        this.publishActivityForRun(run.id, 'cache', cacheKind, timestamp);
      }
      const costKind = crossedBudgetThreshold(previous.budgetBurnRatio, current.budgetBurnRatio);
      if (costKind) this.publishActivityForRun(run.id, 'cost', costKind, timestamp);
      if (
        previous.resourcePressure < 0.8
        && current.resourcePressure >= 0.8
        && current.resourceTimestamp !== previous.resourceTimestamp
      ) {
        this.publishActivityForRun(
          latestResource?.runId ?? run.id,
          'resource',
          'resource.threshold_crossed',
          current.resourceTimestamp ?? timestamp,
        );
      }
    }
  }

  private async healthSample(
    brainId: string,
    signals: BrainHealthSample['signals'],
    timestamp: number,
    weights: BrainHealthWeights,
  ): Promise<BrainHealthSample> {
    if (timestamp - this.lastHealthPruneAt >= HEALTH_HISTORY_SAMPLE_MS) {
      await this.options.observer.deleteHealthScoresBefore(timestamp - HEALTH_HISTORY_RETENTION_MS);
      this.lastHealthPruneAt = timestamp;
    }
    const lastPersistedAt = this.lastPersistedHealthAt.get(brainId);
    const sample: BrainHealthSample = {
      brainId,
      score: calculateBrainHealthScore(signals, weights),
      signals: { ...signals },
      weights: { ...weights },
      timestamp,
    };
    if (lastPersistedAt === undefined || timestamp - lastPersistedAt >= HEALTH_HISTORY_SAMPLE_MS) {
      this.lastPersistedHealthAt.set(brainId, timestamp);
      try {
        await this.options.observer.recordHealthScore(sample);
      } catch (error) {
        if (this.lastPersistedHealthAt.get(brainId) === timestamp) {
          this.lastPersistedHealthAt.delete(brainId);
        }
        throw error;
      }
      return sample;
    }
    return sample;
  }
}

const WITHOUT_RESOURCE_HEALTH_WEIGHTS: BrainHealthWeights = Object.freeze({
  taskSuccessRate: DEFAULT_BRAIN_HEALTH_WEIGHTS.taskSuccessRate / (1 - DEFAULT_BRAIN_HEALTH_WEIGHTS.resourcePressure),
  cacheHitRatio: DEFAULT_BRAIN_HEALTH_WEIGHTS.cacheHitRatio / (1 - DEFAULT_BRAIN_HEALTH_WEIGHTS.resourcePressure),
  compactionPressure: DEFAULT_BRAIN_HEALTH_WEIGHTS.compactionPressure / (1 - DEFAULT_BRAIN_HEALTH_WEIGHTS.resourcePressure),
  churnRatio: DEFAULT_BRAIN_HEALTH_WEIGHTS.churnRatio / (1 - DEFAULT_BRAIN_HEALTH_WEIGHTS.resourcePressure),
  resourcePressure: 0,
  budgetBurnRatio: DEFAULT_BRAIN_HEALTH_WEIGHTS.budgetBurnRatio / (1 - DEFAULT_BRAIN_HEALTH_WEIGHTS.resourcePressure),
});

export interface BrainVitalsRouteDeps {
  service: BrainVitalsService;
  eventBus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit?: BeastRateLimitOptions;
}

export function createBrainVitalsRoutes(deps: BrainVitalsRouteDeps): Hono {
  const app = new Hono();
  const auth = requireBeastOperatorAuth({
    operatorToken: deps.operatorToken,
    security: deps.security,
  });

  app.use('/v1/brain-vitals/*', async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (c.req.method === 'GET' && /^\/v1\/brain-vitals\/[^/]+\/events\/[^/]+$/.test(pathname)) {
      await next();
      return;
    }
    return auth(c, next);
  });
  if (deps.rateLimit) {
    const limiter = new InMemoryRateLimiter(deps.rateLimit);
    app.use('/v1/brain-vitals/*', requireBeastRateLimit(
      limiter,
      (authHeader, path) => `${authHeader ?? 'anonymous'}:${path}`,
    ));
  }
  app.get('/v1/brain-vitals/:brainId', async (c) => (
    c.json({ data: await deps.service.snapshot(c.req.param('brainId')) })
  ));
  app.get('/v1/brain-vitals/:brainId/history', async (c) => {
    const windowMs = parseWindowMs(c.req.query('window'));
    if (windowMs === null) {
      return c.json({ error: { code: 'INVALID_WINDOW', message: 'window must be a positive duration such as 15m, 1h, or 1d' } }, 422);
    }
    return c.json(await deps.service.historyWindow(c.req.param('brainId'), windowMs));
  });
  app.get('/v1/brain-vitals/:brainId/runs/:runId', async (c) => {
    const data = await deps.service.runDetails(c.req.param('brainId'), c.req.param('runId'));
    return data === null
      ? c.json({ error: { code: 'BRAIN_VITALS_RUN_NOT_FOUND', message: 'No matching brain run exists' } }, 404)
      : c.json({ data });
  });
  app.post('/v1/brain-vitals/:brainId/events/ticket', (c) => {
    const brainId = c.req.param('brainId');
    const connectionId = randomUUID();
    const ticket = deps.ticketStore.issue(deps.operatorToken, connectionId);
    setCookie(c, BRAIN_VITALS_SSE_TICKET_COOKIE, ticket, {
      httpOnly: true,
      maxAge: 30,
      path: brainVitalsEventPath(brainId, connectionId),
      sameSite: 'Strict',
      secure: isHttpsRequest(c.req.url, c.req.header('x-forwarded-proto')),
    });
    return c.json({ connectionId });
  });
  app.get('/v1/brain-vitals/:brainId/events', (c) => {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
  });
  app.get('/v1/brain-vitals/:brainId/events/:connectionId', (c) => {
    const brainId = normalizeBrainId(c.req.param('brainId'));
    const ticket = getCookie(c, BRAIN_VITALS_SSE_TICKET_COOKIE);
    if (!ticket) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    const status = deps.ticketStore.consume(ticket, deps.operatorToken, c.req.param('connectionId'));
    if (status === 'reused') return c.body(null, 204);
    if (status === 'invalid') {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }

    return streamSSE(c, async (stream) => {
      let snapshot = JSON.stringify(await deps.service.snapshot(brainId));
      await stream.writeSSE({ event: 'snapshot', data: snapshot });
      const unsubscribe = deps.eventBus.subscribe(async (event) => {
        try {
          const data = event.data;
          if (event.type === 'brain-vitals.activity' && data.brainId === brainId) {
            await stream.writeSSE({
              ...(event.id === undefined ? {} : { id: String(event.id) }),
              event: 'activity',
              data: JSON.stringify({
                dimension: data.dimension,
                kind: data.kind,
                runId: data.runId,
                timestamp: data.timestamp,
              }),
            });
            return;
          }
          if (event.type !== 'run.status') return;
          const runId = typeof data.runId === 'string' ? data.runId : undefined;
          const run = runId ? await deps.service.runDetails(brainId, runId) : null;
          if (run) {
            await stream.writeSSE({
              ...(event.id === undefined ? {} : { id: String(event.id) }),
              event: 'activity',
              data: JSON.stringify({
                dimension: 'churn',
                kind: `churn.${run.run.status}`,
                runId,
                timestamp: Date.now(),
              }),
            });
          }
        } catch {
          // Keep the subscription alive across one transient telemetry read failure.
        }
      });
      let snapshotPending = false;
      const snapshotInterval = setInterval(async () => {
        if (snapshotPending) return;
        snapshotPending = true;
        try {
          const next = JSON.stringify(await deps.service.snapshot(brainId));
          if (next !== snapshot) {
            snapshot = next;
            await stream.writeSSE({ event: 'snapshot', data: next });
          }
        } catch {
          // Keep the stream alive across one transient observer read failure.
        } finally {
          snapshotPending = false;
        }
      }, SNAPSHOT_POLL_MS);
      const heartbeatInterval = setInterval(
        () => void stream.writeSSE({ event: 'heartbeat', data: '' }).catch(() => unsubscribe()),
        HEARTBEAT_MS,
      );
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
      clearInterval(snapshotInterval);
      clearInterval(heartbeatInterval);
      unsubscribe();
    });
  });

  return app;
}

function brainVitalsEventPath(brainId: string, connectionId: string): string {
  return `/v1/brain-vitals/${encodeURIComponent(brainId)}/events/${encodeURIComponent(connectionId)}`;
}

function isHttpsRequest(requestUrl: string, forwardedProto: string | undefined): boolean {
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  return proto ? proto === 'https' : new URL(requestUrl).protocol === 'https:';
}

function compactionKey(event: CompactionEvent): string {
  return `${event.sessionId}:${event.runId}:${event.generation}:${event.timestamp}`;
}

function crossedBudgetThreshold(previous: number, current: number): string | null {
  if (previous < 1 && current >= 1) return 'cost.budget_exhausted';
  if (previous < 0.8 && current >= 0.8) return 'cost.budget_warning';
  if (previous < 0.5 && current >= 0.5) return 'cost.budget_midpoint';
  return null;
}

function parseWindowMs(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_WINDOW_MS;
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unitMs = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 'ms' | 's' | 'm' | 'h' | 'd'
  ];
  const windowMs = amount * unitMs;
  return Number.isSafeInteger(windowMs) && windowMs > 0 && windowMs <= 86_400_000 ? windowMs : null;
}

function traceTokenTotals(
  trace: Trace | null,
  costCalculator: CostCalculator,
  since = 0,
  before = Number.MAX_SAFE_INTEGER,
): TokenAndCostTotals {
  const entries = trace?.spans.filter((span) => {
    const activityAt = span.endedAt ?? span.startedAt;
    return activityAt >= since && activityAt <= before;
  }).map((span) => ({
    model: typeof span.metadata.model === 'string' ? span.metadata.model : 'unknown',
    promptTokens: tokenCount(span.metadata.promptTokens),
    completionTokens: tokenCount(span.metadata.completionTokens),
    cacheReadTokens: tokenCount(span.metadata.cacheReadTokens),
    cacheCreationTokens: tokenCount(span.metadata.cacheCreationTokens),
    cacheCreation1hTokens: tokenCount(span.metadata.cacheCreation1hTokens),
  })) ?? [];
  const promptTokens = entries.reduce((total, entry) => total + entry.promptTokens, 0);
  const completionTokens = entries.reduce((total, entry) => total + entry.completionTokens, 0);
  const cacheReadTokens = entries.reduce((total, entry) => total + entry.cacheReadTokens, 0);
  const cacheCreationTokens = entries.reduce((total, entry) => total + entry.cacheCreationTokens, 0);
  return {
    promptTokens,
    completionTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: promptTokens + completionTokens + cacheReadTokens + cacheCreationTokens,
    cacheHitRatio: cacheHitRatio({ promptTokens, cacheReadTokens }),
    estimatedUsd: costCalculator.totalCost(entries),
  };
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function sumTokenTotals(totals: readonly TokenAndCostTotals[]): TokenAndCostTotals {
  const promptTokens = totals.reduce((sum, value) => sum + value.promptTokens, 0);
  const completionTokens = totals.reduce((sum, value) => sum + value.completionTokens, 0);
  const cacheReadTokens = totals.reduce((sum, value) => sum + value.cacheReadTokens, 0);
  const cacheCreationTokens = totals.reduce((sum, value) => sum + value.cacheCreationTokens, 0);
  return {
    promptTokens,
    completionTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: promptTokens + completionTokens + cacheReadTokens + cacheCreationTokens,
    cacheHitRatio: cacheHitRatio({ promptTokens, cacheReadTokens }),
    estimatedUsd: totals.reduce((sum, value) => sum + value.estimatedUsd, 0),
  };
}

function readBudget(run: BeastRun): number | null {
  const value = run.configSnapshot.budget;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeBrainId(brainId: string): string {
  const normalized = brainId.trim();
  if (normalized.length === 0) throw new TypeError('brainId must not be empty');
  return normalized;
}

function latestRunActivityAt(run: BeastRun): number {
  return Date.parse(run.finishedAt ?? run.startedAt ?? run.createdAt);
}

function sumBudgets(runs: readonly BeastRun[]): number | null {
  const budgets = runs.map(readBudget).filter((value): value is number => value !== null);
  return budgets.length === 0 ? null : budgets.reduce((sum, value) => sum + value, 0);
}

function classifyRun(run: BeastRun): BeastRun['status'] | 'orphaned' {
  if (run.status === 'running' && run.finishedAt) return 'orphaned';
  return run.status;
}

function resourcePressure(sample: ProcessResourceSample): number {
  return clamp(Math.max(
    sample.cpuPercent / 100,
    sample.rssBytes / (1024 ** 3),
    sample.estimatedWatts / 75,
  ));
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
