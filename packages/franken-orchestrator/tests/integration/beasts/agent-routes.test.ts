import { Hono } from 'hono';
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
import { errorHandler } from '../../../src/http/middleware.js';
import { agentRoutes } from '../../../src/http/routes/agent-routes.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/agent-routes');

function createBeastApp() {
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
          pid: 2222,
          startedAt: '2026-03-11T00:01:00.000Z',
          executorMetadata: { backend: 'process' },
        });
        repository.appendEvent(run.id, {
          attemptId: attempt.id,
          type: 'attempt.started',
          payload: { pid: 2222 },
          createdAt: '2026-03-11T00:01:00.000Z',
        });
        await logStore.append(run.id, attempt.id, 'stdout', 'started');
        return attempt;
      }),
      stop: vi.fn(async (runId: string, attemptId: string) => {
        const attempt = repository.updateAttempt(attemptId, {
          status: 'stopped',
          finishedAt: '2026-03-11T00:02:00.000Z',
          stopReason: 'operator_stop',
        });
        repository.updateRun(runId, {
          status: 'stopped',
          finishedAt: '2026-03-11T00:02:00.000Z',
          stopReason: 'operator_stop',
        });
        return attempt;
      }),
      kill: vi.fn(),
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
  const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
  const security = new TransportSecurityService();
  const operatorToken = 'super-secret-operator-token';

  const app = createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'agent-routes',
    beastControl: {
      catalog,
      dispatch,
      runs,
      interviews,
      agents,
      metrics,
      security,
      operatorToken,
      rateLimit: {
        windowMs: 60_000,
        max: 20,
      },
    },
  });

  return { app, operatorToken };
}

function createStandaloneAgentApp() {
  mkdirSync(TMP, { recursive: true });
  const repository = new SQLiteBeastRepository(join(TMP, 'standalone-beasts.db'));
  const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/', agentRoutes({
    agents,
    runs: {
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
      restart: vi.fn(),
    } as never,
    operatorToken: 'super-secret-operator-token',
    security: new TransportSecurityService(),
  }));

  return { app };
}

describe('agent routes', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects unauthenticated access to tracked agent endpoints', async () => {
    const { app } = createBeastApp();

    const listResponse = await app.request('/v1/beasts/agents');

    expect(listResponse.status).toBe(401);
  });

  it('enforces operator auth when agent routes are mounted standalone', async () => {
    const { app } = createStandaloneAgentApp();

    const listResponse = await app.request('/v1/beasts/agents');

    expect(listResponse.status).toBe(401);
  });

  it('returns validation errors for invalid tracked agent payloads', async () => {
    const { app, operatorToken } = createBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'design-interview',
      }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('returns malformed json errors for invalid tracked agent request bodies', async () => {
    const { app, operatorToken } = createBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: '{"definitionId"',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Malformed JSON body',
      },
    });
  });

  it('creates and lists tracked agents for authorized operators', async () => {
    const { app, operatorToken } = createBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'design-interview',
        initAction: {
          kind: 'design-interview',
          command: '/interview',
          config: { goal: 'Design the init workflow' },
          chatSessionId: 'sess-1',
        },
        initConfig: { goal: 'Design the init workflow' },
        chatSessionId: 'sess-1',
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string } };
    expect(created.data.status).toBe('initializing');

    const listResponse = await app.request('/v1/beasts/agents', {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as { data: { agents: Array<{ id: string; chatSessionId?: string }> } };
    expect(listBody.data.agents).toEqual([
      expect.objectContaining({
        id: created.data.id,
        chatSessionId: 'sess-1',
      }),
    ]);
  });

  it('dispatches chunk-plan tracked agents during creation when init config is complete', async () => {
    const { app, operatorToken } = createBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const sessionResponse = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId: 'proj' }),
    });
    expect(sessionResponse.status).toBe(201);
    const createdSession = await sessionResponse.json() as { data: { id: string } };

    const createResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'chunk-plan',
        initAction: {
          kind: 'chunk-plan',
          command: '/plan --design-doc docs/plans/design.md',
          config: {
            designDocPath: 'docs/plans/design.md',
            outputDir: 'docs/chunks',
          },
          chatSessionId: createdSession.data.id,
        },
        initConfig: {
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
        },
        chatSessionId: createdSession.data.id,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string; dispatchRunId?: string } };
    expect(created.data.status).toBe('running');
    expect(created.data.dispatchRunId).toBeTruthy();

    const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as {
      data: {
        agent: { dispatchRunId?: string; chatSessionId?: string; status: string };
        events: Array<{ type: string }>;
      };
    };

    expect(detail.data.agent.status).toBe('running');
    expect(detail.data.agent.chatSessionId).toBe(createdSession.data.id);
    expect(detail.data.agent.dispatchRunId).toBeTruthy();
    expect(detail.data.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'agent.created',
      'agent.chat.bound',
      'agent.command.sent',
      'agent.dispatch.linked',
    ]));

    const runResponse = await app.request(`/v1/beasts/runs/${detail.data.agent.dispatchRunId}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(runResponse.status).toBe(200);
    const runBody = await runResponse.json() as { data: { run: { trackedAgentId?: string; status: string } } };
    expect(runBody.data.run.trackedAgentId).toBe(created.data.id);
    expect(runBody.data.run.status).toBe('running');
  });

  it('returns tracked agent detail including init metadata and linked run id', async () => {
    const { app, operatorToken } = createBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createAgentResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Ship route integration',
            chunkDirectory: 'docs/chunks',
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Ship route integration',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });
    const createdAgent = await createAgentResponse.json() as { data: { id: string } };

    const createRunResponse = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        trackedAgentId: createdAgent.data.id,
        config: {
          provider: 'claude',
          objective: 'Ship route integration',
          chunkDirectory: 'docs/chunks',
        },
        executionMode: 'process',
        startNow: true,
      }),
    });
    expect(createRunResponse.status).toBe(201);
    const createdRun = await createRunResponse.json() as { data: { id: string } };

    const detailResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json() as {
      data: {
        agent: { id: string; dispatchRunId?: string; initAction: { kind: string } };
        events: Array<{ type: string }>;
      };
    };

    expect(detailBody.data.agent.id).toBe(createdAgent.data.id);
    expect(detailBody.data.agent.initAction.kind).toBe('martin-loop');
    expect(detailBody.data.agent.dispatchRunId).toBe(createdRun.data.id);
    expect(detailBody.data.events.map((event) => event.type)).toContain('agent.created');
  });

  it('resumes a stopped tracked agent by creating a new run attempt on the linked run', async () => {
    const { app, operatorToken } = createBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createAgentResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Resume from dashboard',
            chunkDirectory: 'docs/chunks',
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Resume from dashboard',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });
    const createdAgent = await createAgentResponse.json() as { data: { id: string } };

    const createRunResponse = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        trackedAgentId: createdAgent.data.id,
        config: {
          provider: 'claude',
          objective: 'Resume from dashboard',
          chunkDirectory: 'docs/chunks',
        },
        executionMode: 'process',
        startNow: true,
      }),
    });
    const createdRun = await createRunResponse.json() as { data: { id: string } };

    const stopResponse = await app.request(`/v1/beasts/runs/${createdRun.data.id}/stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(stopResponse.status).toBe(200);

    const resumeResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/resume`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(resumeResponse.status).toBe(200);
    const resumed = await resumeResponse.json() as { data: { id: string; attemptCount: number; status: string } };
    expect(resumed.data.id).toBe(createdRun.data.id);
    expect(resumed.data.attemptCount).toBe(2);
    expect(resumed.data.status).toBe('running');
  });

  it('returns 404 for unknown tracked agents', async () => {
    const { app, operatorToken } = createBeastApp();

    const response = await app.request('/v1/beasts/agents/agent-missing', {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_FOUND',
        message: "Tracked agent 'agent-missing' was not found",
      },
    });
  });
});
