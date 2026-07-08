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
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { ContainerBeastExecutor } from '../../../src/beasts/execution/container-beast-executor.js';
import { DEFAULT_SANDBOX_POLICY } from '../../../src/beasts/execution/sandbox-policy.js';
import type { BeastProcessSpec } from '../../../src/beasts/types.js';
import type { ProcessCallbacks, ProcessSupervisorLike } from '../../../src/beasts/execution/process-supervisor.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_SUPER_SECRET_OPERATOR_TOKEN = testCredential('TEST_SUPER_SECRET_OPERATOR_TOKEN');
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/beast-routes');

function createBeastApp(options?: { rateLimitMax?: number; failStart?: boolean; realContainer?: boolean }) {
  mkdirSync(TMP, { recursive: true });
  const repository = new SQLiteBeastRepository(join(TMP, 'beasts.db'));
  const logStore = new BeastLogStore(join(TMP, 'logs'));
  const catalog = new BeastCatalogService();
  const metrics = new PrometheusBeastMetrics();
  const fakeContainerSupervisor: ProcessSupervisorLike = {
    spawn: vi.fn(async (_spec: BeastProcessSpec, _callbacks: ProcessCallbacks) => ({ pid: 5678 })),
    stop: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
  };
  const containerExecutor = options?.realContainer
    ? new ContainerBeastExecutor({
      repository,
      logStore,
      eventBus: new BeastEventBus(),
      supervisorFactory: () => fakeContainerSupervisor,
      policy: { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:test', workspaceHostPath: TMP },
    })
    : undefined;
  const executors = {
    process: {
      start: vi.fn(async (run, _definition) => {
        if (options?.failStart) {
          throw new Error('spawn failed');
        }
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
    container: containerExecutor ?? {
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
    },
  };
  const dispatch = new BeastDispatchService(repository, catalog, executors, metrics, logStore);
  const runs = new BeastRunService(repository, catalog, executors, metrics, logStore);
  const interviews = new BeastInterviewService(repository, catalog);
  const agents = new AgentService(repository, () => '2026-03-10T00:00:00.000Z');
  const security = new TransportSecurityService();
  const operatorToken = TEST_SUPER_SECRET_OPERATOR_TOKEN;

  const app = createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'beast-routes',
    beastControl: {
      agents,
      catalog,
      dispatch,
      runs,
      interviews,
      metrics,
      security,
      operatorToken,
      eventBus: new BeastEventBus(),
      ticketStore: new SseConnectionTicketStore(),
      rateLimit: {
        windowMs: 60_000,
        max: options?.rateLimitMax ?? 20,
      },
    },
  });

  return { app, operatorToken, fakeContainerSupervisor, repository };
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

  it('dispatches a real container executor through the API and exposes container fields', async () => {
    const { app, operatorToken, fakeContainerSupervisor } = createBeastApp({ realContainer: true });
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
          objective: 'Exercise container API dispatch',
          chunkDirectory: 'docs/chunks',
        },
        executionMode: 'container',
        startNow: true,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as {
      data: {
        id: string;
        executionMode: string;
        status: string;
        containerId?: string;
        containerRuntime?: string;
        image?: string;
        containerImage?: string;
        containerNetwork?: string;
        resourceSnapshot?: Record<string, unknown>;
        workspaceContainerPath?: string;
      };
    };
    expect(created.data).toMatchObject({
      executionMode: 'container',
      status: 'running',
      containerId: `fbeast-${created.data.id}-attempt-1`,
      containerRuntime: 'docker',
      image: 'fbeast/sandbox:test',
      containerImage: 'fbeast/sandbox:test',
      containerNetwork: 'none',
      resourceSnapshot: { memory: '512m', cpus: '1.0', pidsLimit: 256 },
      workspaceContainerPath: '/workspace',
    });
    expect(fakeContainerSupervisor.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'docker' }),
      expect.any(Object),
    );

    const detailResponse = await app.request(`/v1/beasts/runs/${created.data.id}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as {
      data: {
        run: { containerId?: string; image?: string; containerImage?: string; workspaceContainerPath?: string };
        attempts: Array<{ executorMetadata?: Record<string, unknown> }>;
      };
    };
    expect(detail.data.run).toMatchObject({
      containerId: `fbeast-${created.data.id}-attempt-1`,
      image: 'fbeast/sandbox:test',
      containerImage: 'fbeast/sandbox:test',
      workspaceContainerPath: '/workspace',
    });
    expect(detail.data.attempts[0]?.executorMetadata).toMatchObject({
      backend: 'container',
      containerId: `fbeast-${created.data.id}-attempt-1`,
      containerRuntime: 'docker',
      image: 'fbeast/sandbox:test',
      containerImage: 'fbeast/sandbox:test',
      dockerCommand: 'docker',
    });
  });

  it('does not require attempts when listing stale process-mode runs', async () => {
    const { app, operatorToken, repository } = createBeastApp();
    const staleRun = repository.createRun({
      definitionId: 'deleted-definition',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'api',
      dispatchedByUser: 'pfk',
      createdAt: '2026-03-10T00:00:00.000Z',
    });

    const response = await app.request('/v1/beasts/runs', {
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { runs: Array<{ id: string }> } };
    expect(body.data.runs.map((run) => run.id)).toContain(staleRun.id);
  });

  it('exposes container fields in start and restart action responses', async () => {
    const { app, operatorToken } = createBeastApp({ realContainer: true });
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createRun = async () => {
      const response = await app.request('/v1/beasts/runs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          definitionId: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Exercise container action response',
            chunkDirectory: 'docs/chunks',
          },
          executionMode: 'container',
          startNow: false,
        }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { data: { id: string } };
    };

    const startCandidate = await createRun();
    const startResponse = await app.request(`/v1/beasts/runs/${startCandidate.data.id}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(startResponse.status).toBe(200);
    const started = await startResponse.json() as { data: { containerId?: string; containerRuntime?: string } };
    expect(started.data).toMatchObject({
      containerId: `fbeast-${startCandidate.data.id}-attempt-1`,
      containerRuntime: 'docker',
    });

    const restartCandidate = await createRun();
    const restartResponse = await app.request(`/v1/beasts/runs/${restartCandidate.data.id}/restart`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(restartResponse.status).toBe(200);
    const restarted = await restartResponse.json() as { data: { containerId?: string; containerRuntime?: string } };
    expect(restarted.data).toMatchObject({
      containerId: `fbeast-${restartCandidate.data.id}-attempt-1`,
      containerRuntime: 'docker',
    });
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

  it('returns 404 and does not persist a run when trackedAgentId is unknown', async () => {
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
        trackedAgentId: 'agent-missing',
        config: {
          provider: 'claude',
          objective: 'Reject invalid tracked agent ids',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });

    expect(createResponse.status).toBe(404);
    expect(await createResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_FOUND',
        message: "Tracked agent 'agent-missing' was not found",
      },
    });

    const runsResponse = await app.request('/v1/beasts/runs', {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const runsBody = await runsResponse.json() as { data: { runs: Array<unknown> } };
    expect(runsBody.data.runs).toEqual([]);
  });

  it('persists a failed run instead of returning 500 when startNow startup fails', async () => {
    const { app, operatorToken } = createBeastApp({ failStart: true });
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
          objective: 'Handle startup failure coherently',
          chunkDirectory: 'docs/chunks',
        },
        executionMode: 'process',
        startNow: true,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string; stopReason?: string } };
    expect(created.data.status).toBe('failed');
    expect(created.data.stopReason).toBe('start_failed');

    const detailResponse = await app.request(`/v1/beasts/runs/${created.data.id}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json() as { data: { run: { status: string; stopReason?: string } } };
    expect(detailBody.data.run.status).toBe('failed');
    expect(detailBody.data.run.stopReason).toBe('start_failed');
  });
});
