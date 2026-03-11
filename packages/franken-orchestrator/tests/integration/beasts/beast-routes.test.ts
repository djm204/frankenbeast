import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChatApp } from '../../../src/http/chat-app.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastInterviewService } from '../../../src/beasts/services/beast-interview-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/beast-routes');

function createBeastApp(options?: { rateLimitMax?: number }) {
  mkdirSync(TMP, { recursive: true });
  const repository = new SQLiteBeastRepository(join(TMP, 'beasts.db'));
  const logStore = new BeastLogStore(join(TMP, 'logs'));
  const catalog = new BeastCatalogService();
  const metrics = new PrometheusBeastMetrics();
  const executors = {
    process: {
      start: vi.fn(async (run, _definition) => {
        const attempt = repository.createAttempt(run.id, {
          status: 'running',
          pid: 1234,
          startedAt: '2026-03-10T00:01:00.000Z',
          executorMetadata: { backend: 'process' },
        });
        repository.appendEvent(run.id, {
          attemptId: attempt.id,
          type: 'attempt.started',
          payload: { pid: 1234 },
          createdAt: '2026-03-10T00:01:00.000Z',
        });
        await logStore.append(run.id, attempt.id, 'stdout', 'started');
        return attempt;
      }),
      stop: vi.fn(async (runId: string, attemptId: string) => {
        repository.updateAttempt(attemptId, {
          status: 'stopped',
          finishedAt: '2026-03-10T00:02:00.000Z',
          stopReason: 'operator_stop',
        });
        repository.updateRun(runId, {
          status: 'stopped',
          finishedAt: '2026-03-10T00:02:00.000Z',
          stopReason: 'operator_stop',
        });
        return repository.getAttempt(attemptId)!;
      }),
      kill: vi.fn(async (runId: string, attemptId: string) => {
        repository.updateAttempt(attemptId, {
          status: 'stopped',
          finishedAt: '2026-03-10T00:02:30.000Z',
          stopReason: 'operator_kill',
        });
        repository.updateRun(runId, {
          status: 'stopped',
          finishedAt: '2026-03-10T00:02:30.000Z',
          stopReason: 'operator_kill',
        });
        return repository.getAttempt(attemptId)!;
      }),
    },
    container: {
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
    },
  };
  const dispatch = new BeastDispatchService(repository, catalog, executors, metrics, logStore);
  const runs = new BeastRunService(repository, catalog, executors, metrics, logStore);
  const interviews = new BeastInterviewService(repository, catalog);
  const security = new TransportSecurityService();
  const operatorToken = 'super-secret-operator-token';

  const app = createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'beast-routes',
    beastControl: {
      catalog,
      dispatch,
      runs,
      interviews,
      metrics,
      security,
      operatorToken,
      rateLimit: {
        windowMs: 60_000,
        max: options?.rateLimitMax ?? 20,
      },
    },
  });

  return { app, operatorToken };
}

describe('beast routes', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('lists the fixed catalog for authorized operators', async () => {
    const { app, operatorToken } = createBeastApp();

    const response = await app.request('/v1/beasts/catalog', {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ id: string }> };
    expect(body.data.map((entry) => entry.id)).toEqual([
      'design-interview',
      'chunk-plan',
      'martin-loop',
    ]);
  });

  it('creates a run, reads it back, and exposes events and logs', async () => {
    const { app, operatorToken } = createBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createResponse = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Implement beast routes',
          chunkDirectory: 'docs/chunks',
        },
        executionMode: 'process',
        startNow: true,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string } };
    expect(created.data.status).toBe('running');

    const detailResponse = await app.request(`/v1/beasts/runs/${created.data.id}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(detailResponse.status).toBe(200);

    const eventsResponse = await app.request(`/v1/beasts/runs/${created.data.id}/events`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const eventsBody = await eventsResponse.json() as { data: { events: Array<{ type: string }> } };
    expect(eventsBody.data.events.map((event) => event.type)).toContain('attempt.started');

    const logsResponse = await app.request(`/v1/beasts/runs/${created.data.id}/logs`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const logsBody = await logsResponse.json() as { data: { logs: string[] } };
    expect(logsBody.data.logs.some((line) => line.includes('started'))).toBe(true);
  });

  it('supports interview start and answer flow', async () => {
    const { app, operatorToken } = createBeastApp();
    const startResponse = await app.request('/v1/beasts/interviews/martin-loop/start', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(startResponse.status).toBe(201);
    const started = await startResponse.json() as { data: { id: string; currentPrompt: { key: string } } };
    expect(started.data.currentPrompt.key).toBe('provider');

    const answerResponse = await app.request(`/v1/beasts/interviews/${started.data.id}/answer`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ answer: 'claude' }),
    });
    expect(answerResponse.status).toBe(200);
    const answered = await answerResponse.json() as { data: { complete: boolean; session: { currentPrompt: { key: string } } } };
    expect(answered.data.complete).toBe(false);
    expect(answered.data.session.currentPrompt.key).toBe('objective');
  });
});
