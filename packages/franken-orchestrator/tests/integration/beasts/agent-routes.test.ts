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
      stop: vi.fn(),
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

describe('agent routes', () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
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
});
