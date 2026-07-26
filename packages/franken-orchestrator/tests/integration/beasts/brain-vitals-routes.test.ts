import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CostCalculator,
  DEFAULT_PRICING,
  SpanLifecycle,
  SQLiteAdapter,
  TraceContext,
} from '@franken/observer';
import { Hono } from 'hono';

import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { createBeastServices } from '../../../src/beasts/create-beast-services.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLifecycleMetrics } from '../../../src/beasts/telemetry/beast-lifecycle-metrics.js';
import {
  BrainVitalsService,
  createBrainVitalsRoutes,
} from '../../../src/http/routes/brain-vitals-routes.js';
import { errorHandler } from '../../../src/http/middleware.js';
import { createBeastDaemonApp } from '../../../src/http/beast-daemon-app.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { testCredential } from '../../support/test-credentials.js';

const OPERATOR_TOKEN = testCredential('TEST_BRAIN_VITALS_OPERATOR_TOKEN');
const NOW = Date.parse('2026-07-26T06:30:00.000Z');

describe('brain vitals routes', () => {
  const cleanups: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  function createFixture() {
    const root = mkdtempSync(join(tmpdir(), 'brain-vitals-routes-'));
    const repository = new SQLiteBeastRepository(join(root, 'beasts.db'));
    const observer = new SQLiteAdapter(join(root, 'observer.db'), { useWorkerThread: false });
    const eventBus = new BeastEventBus();
    const ticketStore = new SseConnectionTicketStore();
    const service = new BrainVitalsService({
      observer,
      runs: repository,
      eventBus,
      costCalculator: new CostCalculator(DEFAULT_PRICING),
      lifecycleMetrics: new BeastLifecycleMetrics(
        window => repository.listLifecycleAttempts(window),
        { now: () => new Date(NOW).toISOString() },
      ),
      now: () => NOW,
    });
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', createBrainVitalsRoutes({
      service,
      eventBus,
      ticketStore,
      operatorToken: OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));
    cleanups.push(async () => {
      ticketStore.destroy();
      await observer.close();
      repository.close();
      rmSync(root, { recursive: true, force: true });
    });
    return { app, eventBus, observer, repository, service };
  }

  function authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${OPERATOR_TOKEN}` };
  }

  it('returns an auth-gated snapshot and real persisted per-run drill-down', async () => {
    const { app, observer, repository } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { budget: 2 },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    const attempt = repository.createAttempt(run.id, {
      status: 'completed',
      startedAt: '2026-07-26T06:01:00.000Z',
    });
    repository.updateAttempt(attempt.id, {
      status: 'completed',
      finishedAt: '2026-07-26T06:10:00.000Z',
      exitCode: 0,
    });
    repository.updateRun(run.id, {
      status: 'completed',
      startedAt: '2026-07-26T06:01:00.000Z',
      finishedAt: '2026-07-26T06:10:00.000Z',
      latestExitCode: 0,
    });

    const trace = TraceContext.createTrace(run.id);
    const span = TraceContext.startSpan(trace, { name: 'known-token-activity' });
    SpanLifecycle.recordTokenUsage(span, {
      model: 'gpt-4o',
      promptTokens: 800,
      completionTokens: 200,
      cacheReadTokens: 200,
    });
    TraceContext.endSpan(span);
    TraceContext.endTrace(trace);
    await observer.flush(trace);
    await observer.recordCompaction({
      sessionId: run.id,
      runId: 'observer-trace-id',
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 4_000,
      tokensAfter: 1_000,
      timestamp: NOW - 10_000,
    });
    await observer.recordResourceSample({
      agentId: 'reviewer-agent',
      runId: run.id,
      pid: process.pid,
      cpuPercent: 25,
      rssBytes: 128 * 1024 * 1024,
      estimatedWatts: 26.25,
      estimatedEnergyWh: 0.05,
      timestamp: NOW - 5_000,
    });

    const unauthenticated = await app.request('/v1/brain-vitals/reviewer');
    expect(unauthenticated.status).toBe(401);

    const snapshot = await app.request('/v1/brain-vitals/reviewer', { headers: authHeaders() });
    expect(snapshot.status).toBe(200);
    expect(await snapshot.json()).toMatchObject({
      data: {
        brainId: 'reviewer',
        health: { score: expect.any(Number) },
        cache: { hitRatio: 0.2, promptTokens: 800, cacheReadTokens: 200 },
        compaction: { count: 1 },
        churn: { completed: 1, failed: 0, stopped: 0 },
        resource: { latest: { cpuPercent: 25, rssBytes: 134217728 } },
        cost: { budgetUsd: 2, burnRatio: expect.any(Number) },
      },
    });

    const details = await app.request(`/v1/brain-vitals/reviewer/runs/${run.id}`, {
      headers: authHeaders(),
    });
    expect(details.status).toBe(200);
    expect(await details.json()).toMatchObject({
      data: {
        run: { id: run.id, definitionId: 'reviewer' },
        churn: { classification: 'completed' },
        tokens: {
          promptTokens: 800,
          completionTokens: 200,
          cacheReadTokens: 200,
          totalTokens: 1_200,
          cacheHitRatio: 0.2,
        },
        compactions: [{ generation: 1, runId: 'observer-trace-id' }],
        resources: [{ cpuPercent: 25, runId: run.id }],
        cost: { estimatedUsd: expect.any(Number), budgetUsd: 2 },
      },
    });
  });

  it('filters persisted score history with a bounded window', async () => {
    const { app, observer } = createFixture();
    const sample = {
      brainId: 'reviewer',
      score: 90,
      signals: {
        taskSuccessRate: 1,
        cacheHitRatio: 0.5,
        compactionPressure: 0,
        churnRatio: 0,
        resourcePressure: 0,
        budgetBurnRatio: 0,
      },
      weights: {
        taskSuccessRate: 0.3,
        cacheHitRatio: 0.15,
        compactionPressure: 0.15,
        churnRatio: 0.15,
        resourcePressure: 0.1,
        budgetBurnRatio: 0.15,
      },
    } as const;
    await observer.recordHealthScore({ ...sample, timestamp: NOW - 2 * 60 * 60 * 1_000 });
    await observer.recordHealthScore({ ...sample, score: 95, timestamp: NOW - 30 * 60 * 1_000 });

    const response = await app.request('/v1/brain-vitals/reviewer/history?window=1h', {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ brainId: 'reviewer', score: 95 }],
      window: { windowMs: 3_600_000, since: NOW - 3_600_000, before: NOW },
    });
  });

  it('uses persisted attempt-level lifecycle metrics for churn', async () => {
    const { repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    repository.createAttempt(run.id, {
      status: 'failed',
      startedAt: '2026-07-26T06:10:00.000Z',
    });

    const snapshot = await service.snapshot('reviewer');

    expect(snapshot.churn).toMatchObject({
      spawnCount: 1,
      completed: 0,
      failed: 1,
      stopped: 0,
      ratio: 1,
    });
    expect(snapshot.health.signals.churnRatio).toBe(1);
  });

  it('pushes an immediate typed activity event when a real compaction is recorded', async () => {
    const { app, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    const ticketResponse = await app.request('/v1/brain-vitals/reviewer/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(ticketResponse.status).toBe(200);
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    const cookie = ticketResponse.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toContain('frankenbeast_brain_vitals_sse_ticket=');
    expect(cookie).not.toContain(OPERATOR_TOKEN);
    const response = await app.request(`/v1/brain-vitals/reviewer/events/${connectionId}`, {
      headers: { cookie: cookie! },
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const initial = await reader.read();
    expect(decoder.decode(initial.value)).toContain('event: snapshot');

    const activityRead = reader.read();
    await service.recordCompaction({
      sessionId: run.id,
      runId: run.id,
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 2_000,
      tokensAfter: 500,
      timestamp: NOW,
    });
    const activity = await activityRead;
    const text = decoder.decode(activity.value);
    await reader.cancel();

    expect(text).toContain('event: activity');
    expect(text).toContain('"dimension":"compaction"');
    expect(text).toContain('"kind":"compaction.completed"');
    expect(text).toContain(`"runId":"${run.id}"`);
    expect(text).toContain(`"timestamp":${NOW}`);
  });

  it('mounts the route family on the production Beast daemon service bundle', async () => {
    const root = mkdtempSync(join(tmpdir(), 'brain-vitals-daemon-'));
    const services = createBeastServices({
      root,
      beastsDb: join(root, '.fbeast', 'beast.db'),
      beastLogsDir: join(root, '.fbeast', '.build', 'beasts', 'logs'),
      tracesDb: join(root, '.fbeast', '.build', 'build-traces.db'),
    });
    cleanups.push(() => {
      services.dispose();
      rmSync(root, { recursive: true, force: true });
    });
    const app = createBeastDaemonApp({ services, operatorToken: OPERATOR_TOKEN });

    const response = await app.request('/v1/brain-vitals/reviewer', { headers: authHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { brainId: 'reviewer', health: { score: expect.any(Number) } },
    });
  });

  it('turns telemetry persisted by external run writers into bus activity on refresh', async () => {
    const { eventBus, observer, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    await service.snapshot('reviewer');
    const events: Array<Record<string, unknown>> = [];
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'brain-vitals.activity') events.push(event.data);
    });
    await observer.recordCompaction({
      sessionId: run.id,
      runId: 'external-trace-id',
      generation: 1,
      triggerReason: 'threshold',
      tokensBefore: 2_000,
      tokensAfter: 500,
      timestamp: NOW,
    });

    await service.snapshot('reviewer');
    unsubscribe();

    expect(events).toContainEqual({
      brainId: 'reviewer',
      dimension: 'compaction',
      kind: 'compaction.completed',
      runId: run.id,
      timestamp: NOW,
    });
  });

  it('classifies external cache, budget, and resource threshold activity', async () => {
    const { eventBus, observer, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { budget: 0.000_001 },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    await service.snapshot('reviewer');
    const events: Array<Record<string, unknown>> = [];
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'brain-vitals.activity') events.push(event.data);
    });
    const trace = TraceContext.createTrace(run.id);
    const span = TraceContext.startSpan(trace, { name: 'external-token-activity' });
    SpanLifecycle.recordTokenUsage(span, {
      model: 'gpt-4o',
      promptTokens: 800,
      completionTokens: 200,
      cacheReadTokens: 200,
    });
    TraceContext.endSpan(span);
    TraceContext.endTrace(trace);
    await observer.flush(trace);
    await observer.recordResourceSample({
      agentId: 'reviewer-agent',
      runId: run.id,
      pid: process.pid,
      cpuPercent: 90,
      rssBytes: 128 * 1024 * 1024,
      estimatedWatts: 70,
      estimatedEnergyWh: 0.1,
      timestamp: NOW - 1,
    });

    await service.snapshot('reviewer');
    unsubscribe();

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'cache', kind: 'cache.hit', runId: run.id }),
      expect.objectContaining({ dimension: 'cost', kind: 'cost.budget_exhausted', runId: run.id }),
      expect.objectContaining({ dimension: 'resource', kind: 'resource.threshold_crossed', runId: run.id }),
    ]));
  });

});
