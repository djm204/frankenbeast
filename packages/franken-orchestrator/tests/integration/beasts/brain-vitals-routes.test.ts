import { afterEach, describe, expect, it, vi } from 'vitest';
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

  function createFixture(rateLimit?: { windowMs: number; max: number }) {
    const root = mkdtempSync(join(tmpdir(), 'brain-vitals-routes-'));
    const repository = new SQLiteBeastRepository(join(root, 'beasts.db'));
    const observer = new SQLiteAdapter(join(root, 'observer.db'), { useWorkerThread: false });
    const eventBus = new BeastEventBus();
    const ticketStore = new SseConnectionTicketStore();
    const lifecycleMetrics = new BeastLifecycleMetrics(
      window => repository.listLifecycleAttempts(window),
      { now: () => new Date(NOW).toISOString() },
    );
    const service = new BrainVitalsService({
      observer,
      runs: repository,
      eventBus,
      costCalculator: new CostCalculator(DEFAULT_PRICING),
      lifecycleMetrics,
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
      ...(rateLimit ? { rateLimit } : {}),
    }));
    cleanups.push(async () => {
      ticketStore.destroy();
      await observer.close();
      repository.close();
      rmSync(root, { recursive: true, force: true });
    });
    return { app, eventBus, lifecycleMetrics, observer, repository, service };
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
    Object.assign(span, { startedAt: NOW - 5_000, endedAt: NOW - 5_000 });
    TraceContext.endTrace(trace);
    await observer.flush(trace);
    await observer.recordCompaction({
      sessionId: 'production-chunk-session-id',
      runId: run.id,
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
        compactions: [{ generation: 1, runId: run.id }],
        resources: [{ cpuPercent: 25, runId: run.id }],
        cost: { estimatedUsd: expect.any(Number), budgetUsd: 2 },
      },
    });
  });

  it('marks missing container resource telemetry unavailable and excludes it from health scoring', async () => {
    const { app, repository } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'container',
      configSnapshot: {},
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

    const response = await app.request('/v1/brain-vitals/reviewer', { headers: authHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        health: {
          score: 83.33,
          weights: { resourcePressure: 0 },
        },
        resource: {
          availability: 'unavailable',
          latest: null,
          sampleCount: 0,
        },
      },
    });
  });

  it('filters snapshot token telemetry to the requested time window', async () => {
    const { observer, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T04:00:00.000Z',
    });
    const trace = TraceContext.createTrace(run.id);
    const oldSpan = TraceContext.startSpan(trace, { name: 'old' });
    SpanLifecycle.recordTokenUsage(oldSpan, { model: 'gpt-4o', promptTokens: 900, completionTokens: 0 });
    TraceContext.endSpan(oldSpan);
    Object.assign(oldSpan, { startedAt: NOW - 2 * 60 * 60 * 1_000, endedAt: NOW - 2 * 60 * 60 * 1_000 });
    const recentSpan = TraceContext.startSpan(trace, { name: 'recent' });
    SpanLifecycle.recordTokenUsage(recentSpan, { model: 'gpt-4o', promptTokens: 100, completionTokens: 0 });
    TraceContext.endSpan(recentSpan);
    Object.assign(recentSpan, { startedAt: NOW - 1_000, endedAt: NOW - 1_000 });
    TraceContext.endTrace(trace);
    await observer.flush(trace);

    const snapshot = await service.snapshot('reviewer');
    const details = await service.runDetails('reviewer', run.id);

    expect(snapshot.cache.promptTokens).toBe(100);
    expect(details?.tokens.promptTokens).toBe(1_000);
  });

  it('loads snapshot runs through the bounded definition-window query', async () => {
    const { repository, service } = createFixture();
    repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T06:00:00.000Z',
    });
    const listRuns = vi.spyOn(repository, 'listRuns');

    await service.snapshot('reviewer');

    expect(listRuns).not.toHaveBeenCalled();
  });

  it('serializes concurrent health persistence and prunes expired resource samples', async () => {
    const { observer, repository, service } = createFixture();
    repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T06:00:00.000Z',
    });
    await observer.recordResourceSample({
      agentId: 'old-agent', runId: 'old-run', pid: 1, cpuPercent: 1, rssBytes: 1,
      estimatedWatts: 1, estimatedEnergyWh: 1, timestamp: NOW - 25 * 60 * 60 * 1_000,
    });

    await Promise.all([service.snapshot('reviewer'), service.snapshot('reviewer')]);

    await expect(observer.queryHealthScores({ brainId: 'reviewer' })).resolves.toHaveLength(1);
    await expect(observer.queryResourceSamples({ runId: 'old-run' })).resolves.toHaveLength(0);
  });

  it('does not scan trace summaries when runs have directly correlated traces', async () => {
    const { observer, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T06:00:00.000Z',
    });
    const trace = TraceContext.createTrace(run.id);
    trace.id = run.id;
    TraceContext.endTrace(trace);
    await observer.flush(trace);
    const listTraceSummaries = vi.spyOn(observer, 'listTraceSummaries');

    await service.snapshot('reviewer');

    expect(listTraceSummaries).not.toHaveBeenCalled();
  });

  it('attributes aggregate cache activity to the run whose telemetry changed', async () => {
    const { eventBus, observer, repository, service } = createFixture();
    const older = repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T06:00:00.000Z',
    });
    repository.createRun({
      definitionId: 'reviewer', definitionVersion: 1, executionMode: 'process', configSnapshot: {},
      dispatchedBy: 'dashboard', dispatchedByUser: 'operator', createdAt: '2026-07-26T06:10:00.000Z',
    });
    await service.snapshot('reviewer');
    const events: Array<Record<string, unknown>> = [];
    const unsubscribe = eventBus.subscribe(event => {
      if (event.type === 'brain-vitals.activity') events.push(event.data);
    });
    const trace = TraceContext.createTrace(older.id);
    const span = TraceContext.startSpan(trace, { name: 'older-run-usage' });
    SpanLifecycle.recordTokenUsage(span, { model: 'gpt-4o', promptTokens: 100, completionTokens: 0 });
    TraceContext.endSpan(span);
    Object.assign(span, { startedAt: NOW - 1_000, endedAt: NOW - 1_000 });
    TraceContext.endTrace(trace);
    await observer.flush(trace);

    await service.snapshot('reviewer');
    unsubscribe();

    expect(events).toContainEqual(expect.objectContaining({ dimension: 'cache', runId: older.id }));
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

  it('authenticates ticket issuance and rate limits expensive reads', async () => {
    const { app } = createFixture({ windowMs: 60_000, max: 1 });

    const ticket = await app.request('/v1/brain-vitals/reviewer/events/ticket', { method: 'POST' });
    const first = await app.request('/v1/brain-vitals/reviewer', { headers: authHeaders() });
    const second = await app.request('/v1/brain-vitals/reviewer', { headers: authHeaders() });

    expect(ticket.status).toBe(401);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('normalizes brain IDs once and prunes expired health history', async () => {
    const { observer, repository, service } = createFixture();
    repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    await observer.recordHealthScore({
      brainId: 'reviewer',
      score: 1,
      signals: {
        taskSuccessRate: 0,
        cacheHitRatio: 0,
        compactionPressure: 1,
        churnRatio: 1,
        resourcePressure: 1,
        budgetBurnRatio: 1,
      },
      weights: {
        taskSuccessRate: 0.3,
        cacheHitRatio: 0.15,
        compactionPressure: 0.15,
        churnRatio: 0.15,
        resourcePressure: 0.1,
        budgetBurnRatio: 0.15,
      },
      timestamp: NOW - 25 * 60 * 60 * 1_000,
    });

    const snapshot = await service.snapshot('  reviewer  ');
    const history = await observer.queryHealthScores({ brainId: 'reviewer', limit: 100 });

    expect(snapshot.brainId).toBe('reviewer');
    expect(snapshot.churn.spawnCount).toBe(1);
    expect(history.some((sample) => sample.timestamp < NOW - 24 * 60 * 60 * 1_000)).toBe(false);
  });

  it('includes recently retried runs without assigning global orphan sweeps to the brain', async () => {
    const { lifecycleMetrics, repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-20T06:00:00.000Z',
    });
    repository.updateRun(run.id, {
      status: 'completed',
      startedAt: '2026-07-26T06:10:00.000Z',
      finishedAt: '2026-07-26T06:20:00.000Z',
    });
    repository.createAttempt(run.id, {
      status: 'completed',
      startedAt: '2026-07-26T06:10:00.000Z',
    });
    lifecycleMetrics.recordOrphanProcessSwept();

    const snapshot = await service.snapshot('reviewer');

    expect(snapshot.churn.completed).toBe(1);
    expect(snapshot.churn.orphaned).toBe(0);
  });

  it('bounds and redacts drill-down run data', async () => {
    const { repository, service } = createFixture();
    const run = repository.createRun({
      definitionId: 'reviewer',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { projectRoot: '/home/operator/private/repo' },
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-26T06:00:00.000Z',
    });
    for (let index = 0; index < 105; index += 1) {
      repository.appendEvent(run.id, {
        type: 'run.created',
        payload: { path: `/home/operator/private/repo/${index}` },
        createdAt: new Date(NOW + index).toISOString(),
      });
    }

    const details = await service.runDetails('reviewer', run.id);

    expect(JSON.stringify(details?.run)).not.toContain('/home/operator/private/repo');
    expect(details?.events).toHaveLength(100);
    expect(details?.eventsTruncated).toBe(true);
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

  it('normalizes the brain id before filtering SSE activity', async () => {
    const { app, eventBus } = createFixture();
    const encodedBrainId = encodeURIComponent(' reviewer ');
    const ticketResponse = await app.request(`/v1/brain-vitals/${encodedBrainId}/events/ticket`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    const cookie = ticketResponse.headers.get('set-cookie')?.split(';')[0];
    const response = await app.request(`/v1/brain-vitals/${encodedBrainId}/events/${connectionId}`, {
      headers: { cookie: cookie! },
    });
    const reader = response.body!.getReader();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const activityRead = reader.read();
    eventBus.publish({
      type: 'brain-vitals.activity',
      data: {
        brainId: 'reviewer',
        dimension: 'churn',
        kind: 'churn.running',
        runId: 'run-normalized',
        timestamp: NOW,
      },
    });
    const activity = await Promise.race([
      activityRead,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('activity timeout')), 100)),
    ]);
    const text = new TextDecoder().decode(activity.value);
    await reader.cancel();

    expect(text).toContain('event: activity');
    expect(text).toContain('"runId":"run-normalized"');
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
      sessionId: 'external-chunk-session-id',
      runId: run.id,
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
    Object.assign(span, { startedAt: NOW - 1_000, endedAt: NOW - 1_000 });
    TraceContext.endTrace(trace);
    await observer.flush(trace);
    await observer.recordResourceSample({
      agentId: 'reviewer-agent',
      runId: run.id,
      pid: process.pid,
      cpuPercent: 10,
      rssBytes: 64 * 1024 * 1024,
      estimatedWatts: 10,
      estimatedEnergyWh: 0.01,
      timestamp: NOW - 2,
    });
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
