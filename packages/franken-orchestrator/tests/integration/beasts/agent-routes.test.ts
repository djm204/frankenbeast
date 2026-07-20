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
import { SAFE_DISPATCH_FAILURE_MESSAGE } from '../../../src/beasts/services/dispatch-failure-message.js';
import { AgentService } from '../../../src/beasts/services/agent-service.js';
import { AgentToolPolicyError } from '../../../src/beasts/services/role-tool-manifest.js';
import { MaintenanceModeError } from '../../../src/beasts/services/maintenance-mode-service.js';
import { CapacityReservationError, CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { errorHandler } from '../../../src/http/middleware.js';
import { agentRoutes } from '../../../src/http/routes/agent-routes.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import Database from 'better-sqlite3';

import { testCredential } from '../../support/test-credentials.js';

const TEST_SUPER_SECRET_OPERATOR_TOKEN = testCredential('TEST_SUPER_SECRET_OPERATOR_TOKEN');
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/agent-routes');

const CODING_POLICY = {
  agentRole: 'coding',
  requestedTools: [
    'read_file', 'search_files', 'write_file', 'patch', 'terminal',
    'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment',
  ],
  skills: [],
} as const;

const DOCS_POLICY = {
  agentRole: 'docs',
  requestedTools: ['read_file', 'search_files', 'write_file'],
  skills: [],
} as const;

type AgentEvent = { type: string };

function expectEventsToIncludeTypes(events: AgentEvent[], requiredTypes: string[]) {
  const actualTypes = new Set(events.map((event) => event.type));

  for (const requiredType of requiredTypes) {
    expect(actualTypes.has(requiredType), `expected agent events to include ${requiredType}`).toBe(true);
  }
}

function createIntegratedBeastApp(opts?: {
  rateLimitMax?: number;
  capacityPolicy?: CapacityReservationPolicy;
  trustedSkillToolManifests?: Readonly<Record<string, readonly string[]>>;
}) {
  // Intentionally exercise the route with the real repository, dispatch service,
  // run service, and event log graph. This file lives under tests/integration so
  // circular service/linking behavior is covered here rather than hidden in unit tests.
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
      kill: vi.fn(async (runId: string, attemptId: string) => {
        const attempt = repository.updateAttempt(attemptId, {
          status: 'stopped',
          finishedAt: '2026-03-11T00:02:30.000Z',
          stopReason: 'operator_kill',
        });
        repository.updateRun(runId, {
          status: 'stopped',
          finishedAt: '2026-03-11T00:02:30.000Z',
          stopReason: 'operator_kill',
        });
        return attempt;
      }),
    },
    container: {
      start: vi.fn(async (run, _definition) => {
        const attempt = repository.createAttempt(run.id, {
          status: 'running',
          startedAt: '2026-03-11T00:01:00.000Z',
          executorMetadata: { backend: 'container' },
        });
        repository.updateRun(run.id, {
          status: 'running',
          startedAt: '2026-03-11T00:01:00.000Z',
          currentAttemptId: attempt.id,
          attemptCount: 1,
        });
        return attempt;
      }),
      stop: vi.fn(),
      kill: vi.fn(),
    },
  };
  const dispatch = new BeastDispatchService(repository, catalog, executors, metrics, logStore, {
    capacityPolicy: opts?.capacityPolicy,
  });
  const runs = new BeastRunService(repository, catalog, executors, metrics, logStore, {
    capacityPolicy: opts?.capacityPolicy,
  });
  const interviews = new BeastInterviewService(repository, catalog);
  const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z', {
    capacityPolicy: opts?.capacityPolicy,
    trustedSkillToolManifests: opts?.trustedSkillToolManifests,
  });
  const security = new TransportSecurityService();
  const operatorToken = TEST_SUPER_SECRET_OPERATOR_TOKEN;

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
      eventBus: new BeastEventBus(),
      ticketStore: new SseConnectionTicketStore(),
      rateLimit: {
        windowMs: 60_000,
        max: opts?.rateLimitMax ?? 20,
      },
    },
  });

  return { app, operatorToken, agents };
}

function createStandaloneAgentApp() {
  mkdirSync(TMP, { recursive: true });
  const repository = new SQLiteBeastRepository(join(TMP, 'standalone-beasts.db'));
  const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
  const runs = {
    getRun: vi.fn((runId: string) => repository.getRun(runId)),
    start: vi.fn(),
    stop: vi.fn(),
    kill: vi.fn(),
    restart: vi.fn(),
  };
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/', agentRoutes({
    agents,
    runs: runs as never,
    operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
    security: new TransportSecurityService(),
  }));

  return { app, agents, runs, repository };
}

describe('agent routes integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects unauthenticated access to tracked agent endpoints', async () => {
    const { app } = createIntegratedBeastApp();

    const listResponse = await app.request('/v1/beasts/agents');

    expect(listResponse.status).toBe(401);
  });

  it('enforces operator auth when agent routes are mounted standalone', async () => {
    const { app } = createStandaloneAgentApp();

    const listResponse = await app.request('/v1/beasts/agents');

    expect(listResponse.status).toBe(401);
  });

  it('translates capacity reservation failures from linked agent resume into 409 responses', async () => {
    const { app, agents, runs, repository } = createStandaloneAgentApp();
    const agent = agents.createAgent({
      definitionId: 'martin-loop',
      source: 'dashboard',
      createdByUser: 'operator',
      initAction: {
        kind: 'martin-loop',
        command: 'martin-loop',
        config: {
          provider: 'claude',
          objective: 'Resume with capacity guard',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
        },
      },
      initConfig: {
        provider: 'claude',
        objective: 'Resume with capacity guard',
        chunkDirectory: 'docs/chunks',
        ...CODING_POLICY,
      },
    });
    const linkedRun = repository.createRun({
      trackedAgentId: agent.id,
      definitionId: 'martin-loop',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: agent.initConfig,
      dispatchedBy: 'dashboard',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-11T00:00:00.000Z',
    });
    agents.linkRun(agent.id, linkedRun.id);
    agents.updateAgent(agent.id, { status: 'stopped' });
    runs.start.mockRejectedValue(new CapacityReservationError(
      { allowed: false, reason: 'reserved_capacity_only', reservationId: 'urgent' },
      {
        totalSlots: 1,
        usedSlots: 0,
        freeSlots: 1,
        normalSlots: { total: 0, used: 0, free: 0 },
        reservations: [{ id: 'urgent', slots: 1, used: 0, free: 1, released: false, labels: ['urgent'], categories: [] }],
      },
    ));

    const response = await app.request(`/v1/beasts/agents/${agent.id}/resume`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_SUPER_SECRET_OPERATOR_TOKEN}` },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_CAPACITY_RESERVED',
      },
    });
  });

  it('preserves capacity conflict responses when auto-dispatch loses a capacity race', async () => {
    mkdirSync(TMP, { recursive: true });
    const repository = new SQLiteBeastRepository(join(TMP, 'auto-dispatch-capacity.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const runs = { getRun: vi.fn(), start: vi.fn(), stop: vi.fn(), kill: vi.fn(), restart: vi.fn() };
    const dispatch = {
      createRun: vi.fn(async () => {
        throw new CapacityReservationError(
          { allowed: false, reason: 'reserved_capacity_only', reservationId: undefined },
          {
            totalSlots: 1,
            usedSlots: 1,
            freeSlots: 0,
            normalSlots: { total: 1, used: 1, free: 0 },
            reservations: [],
          },
        );
      }),
    };
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', agentRoutes({
      agents,
      dispatch: dispatch as never,
      runs: runs as never,
      operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SUPER_SECRET_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: { provider: 'claude', objective: 'Race auto-dispatch', chunkDirectory: 'docs/chunks', ...CODING_POLICY },
        },
        initConfig: { provider: 'claude', objective: 'Race auto-dispatch', chunkDirectory: 'docs/chunks', ...CODING_POLICY },
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_CAPACITY_RESERVED',
        details: {
          decision: { reason: 'reserved_capacity_only' },
        },
      },
    });
    expect(repository.listTrackedAgents()).toHaveLength(1);
    expect(repository.listTrackedAgents()[0]).toMatchObject({ status: 'initializing' });
  });

  it('stops tracked agents when auto-dispatch loses a maintenance race', async () => {
    mkdirSync(TMP, { recursive: true });
    const repository = new SQLiteBeastRepository(join(TMP, 'auto-dispatch-maintenance.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const runs = { getRun: vi.fn(), start: vi.fn(), stop: vi.fn(), kill: vi.fn(), restart: vi.fn() };
    const dispatch = {
      createRun: vi.fn(async () => {
        throw new MaintenanceModeError({
          enabled: true,
          reason: 'deploy',
          allowedCommands: ['beasts list'],
        });
      }),
    };
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', agentRoutes({
      agents,
      dispatch: dispatch as never,
      runs: runs as never,
      operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SUPER_SECRET_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: { provider: 'claude', objective: 'Race maintenance', chunkDirectory: 'docs/chunks', ...CODING_POLICY },
        },
        initConfig: { provider: 'claude', objective: 'Race maintenance', chunkDirectory: 'docs/chunks', ...CODING_POLICY },
      }),
    });

    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'MAINTENANCE_MODE_ACTIVE',
      },
    });
    const [agent] = repository.listTrackedAgents();
    expect(agent).toMatchObject({ status: 'stopped' });
    expect(agents.getAgentDetail(agent.id).events.map((event) => event.type)).toContain('agent.dispatch.paused');
  });

  it('returns validation errors for invalid tracked agent payloads', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();

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

  it('returns a policy-denied 403 for forbidden role tool manifests', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        autoDispatch: false,
        initAction: {
          kind: 'martin-loop',
          command: 'ticket-manager',
          config: {},
        },
        initConfig: {
          agentRole: 'ticket-manager',
          requestedTools: ['read_file', 'patch'],
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_TOOL_POLICY_DENIED',
        details: {
          validation: {
            denials: expect.arrayContaining([expect.objectContaining({ requestedTool: 'patch' })]),
          },
        },
      },
    });
    expect(agents.listAgents()).toEqual([]);
  });

  it('canonicalizes role aliases before applying dashboard policy defaults', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        autoDispatch: false,
        initAction: { kind: 'martin-loop', command: 'ticket-manager', config: {} },
        initConfig: {
          role: 'ticket-manager',
          requestedTools: ['read_file', 'patch'],
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_TOOL_POLICY_DENIED',
        details: {
          validation: {
            role: 'ticket-manager',
            denials: expect.arrayContaining([expect.objectContaining({ requestedTool: 'patch' })]),
          },
        },
      },
    });
    expect(agents.listAgents()).toEqual([]);
  });

  it('does not seed default requested tools over an explicit tool manifest alias', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + operatorToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'chunk-plan',
        autoDispatch: false,
        initAction: { kind: 'chunk-plan', command: 'chunk-plan', config: {} },
        initConfig: {
          agentRole: 'docs',
          tools: ['read_file'],
          skills: [],
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_TOOL_POLICY_DENIED',
        details: { validation: { denials: expect.arrayContaining([
          expect.objectContaining({ requestedTool: 'search_files' }),
          expect.objectContaining({ requestedTool: 'write_file' }),
        ]) } },
      },
    });
    expect(agents.listAgents()).toEqual([]);
  });

  it('includes body-implied runtime and trusted skill tools in default manifests', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp({
      trustedSkillToolManifests: { github: ['get_issue'] },
    });

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + operatorToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'chunk-plan',
        autoDispatch: false,
        initAction: { kind: 'chunk-plan', command: 'chunk-plan', config: {} },
        initConfig: {
          skills: ['github'],
          gitConfig: { prCreation: 'manual' },
        },
      }),
    });

    expect(response.status).toBe(201);
    expect(agents.listAgents()[0]?.initConfig).toMatchObject({
      agentRole: 'docs',
      requestedTools: ['read_file', 'search_files', 'write_file', 'github.pr', 'github.read'],
      skills: ['github'],
    });
  });

  it('honors policy fields supplied in init action config before applying dashboard defaults', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        autoDispatch: false,
        initAction: {
          kind: 'martin-loop',
          command: 'ticket-manager',
          config: {
            agentRole: 'triage',
            requestedTools: ['read_file', 'search_files'],
            skills: [],
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Do not replace an explicit lower-privilege role',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_TOOL_POLICY_DENIED',
        details: { validation: { rawRole: 'triage' } },
      },
    });
    expect(agents.listAgents()).toEqual([]);
  });

  it('returns a policy-denied 403 when auto-dispatch rejects the effective run policy', async () => {
    mkdirSync(TMP, { recursive: true });
    const repository = new SQLiteBeastRepository(join(TMP, 'auto-dispatch-policy-denial.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const denial = {
      role: 'coding' as const,
      requestedTool: 'skill:changed-manifest',
      reason: 'selected skill manifest changed before dispatch',
    };
    const dispatch = {
      createRun: vi.fn(async () => {
        throw new AgentToolPolicyError({
          allowed: false,
          role: 'coding',
          rawRole: 'coding',
          requestedTools: ['skill:changed-manifest'],
          denials: [denial],
        });
      }),
    };
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', agentRoutes({
      agents,
      dispatch: dispatch as never,
      runs: { getRun: vi.fn(), start: vi.fn(), stop: vi.fn(), kill: vi.fn(), restart: vi.fn() } as never,
      operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_SUPER_SECRET_OPERATOR_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: {
          provider: 'claude',
          objective: 'Reject after effective dispatch policy changes',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'AGENT_TOOL_POLICY_DENIED',
        details: {
          validation: { denials: [denial] },
        },
      },
    });
    const [agent] = agents.listAgents();
    expect(agent).toMatchObject({ status: 'stopped' });
    expect(agents.getAgentDetail(agent.id).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent.dispatch.denied' }),
    ]));
  });

  it('derives policy defaults for dashboard wizard agent launches', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        autoDispatch: false,
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {},
        },
        initConfig: {
          provider: 'claude',
          objective: 'Launch from the dashboard without explicit policy fields',
          chunkDirectory: 'docs/chunks',
        },
      }),
    });

    expect(response.status).toBe(201);
    const [agent] = agents.listAgents();
    expect(agent.initConfig).toMatchObject({
      agentRole: 'coding',
      requestedTools: [
        'read_file', 'search_files', 'write_file', 'patch', 'terminal',
        'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment',
      ],
      skills: [],
    });
  });

  it('ignores tracked-run policy overrides and preserves the stored agent policy', async () => {
    const { app, operatorToken, agents } = createIntegratedBeastApp();

    const createResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        autoDispatch: false,
        initAction: { kind: 'martin-loop', command: 'martin-loop', config: {} },
        initConfig: { provider: 'claude', objective: 'Create tracked shell', chunkDirectory: 'docs/chunks' },
      }),
    });
    expect(createResponse.status).toBe(201);
    const [agent] = agents.listAgents();

    const runResponse = await app.request('/v1/beasts/runs', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        trackedAgentId: agent.id,
        config: {
          provider: 'claude',
          objective: 'Dispatch with an untrusted selected skill',
          chunkDirectory: 'docs/chunks',
          skills: ['unknown-installed-skill'],
        },
      }),
    });

    expect(runResponse.status).toBe(201);
    expect(agents.getAgent(agent.id).initConfig.skills).toEqual([]);
  });

  it('returns malformed json errors for invalid tracked agent request bodies', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();

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

  it('rejects unauthenticated large wizard launch payloads before buffering up to the beast cap', async () => {
    const { app } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Start later',
            chunkDirectory: 'docs/chunks',
            ...CODING_POLICY,
            promptConfig: { text: 'x'.repeat(20 * 1024) },
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Start later',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
          promptConfig: { text: 'x'.repeat(20 * 1024) },
        },
        autoDispatch: false,
      }),
    });

    expect(response.status).toBe(401);
  });

  it('allows wizard launch payloads above the small control API body cap', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Start later',
            chunkDirectory: 'docs/chunks',
            ...CODING_POLICY,
            promptConfig: { text: 'x'.repeat(20 * 1024) },
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Start later',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
          promptConfig: { text: 'x'.repeat(20 * 1024) },
        },
        autoDispatch: false,
      }),
    });

    expect(response.status).toBe(201);
  });

  it('rejects unauthenticated large beast payloads before applying the large body cap', async () => {
    const { app } = createIntegratedBeastApp();

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: { promptConfig: { text: 'x'.repeat(2 * 1024 * 1024) }, ...CODING_POLICY },
        },
        initConfig: { promptConfig: { text: 'x'.repeat(2 * 1024 * 1024) }, ...CODING_POLICY },
        autoDispatch: false,
      }),
    });

    expect(response.status).toBe(401);
  });

  it('creates, dispatches, and lists tracked agents for authorized operators', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
          config: {
            goal: 'Design the init workflow',
            outputPath: 'docs/design.md',
            ...DOCS_POLICY,
          },
          chatSessionId: 'sess-1',
        },
        initConfig: {
          goal: 'Design the init workflow',
          outputPath: 'docs/design.md',
          ...DOCS_POLICY,
        },
        chatSessionId: 'sess-1',
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string } };
    expect(created.data.status).toBe('running');

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

  it('defaults tracked-agent pages to 50 and validates cursors and limits', async () => {
    const { app, operatorToken } = createIntegratedBeastApp({ rateLimitMax: 100 });
    const headers = {
      authorization: 'Bear' + 'er ' + operatorToken,
      'content-type': 'application/json',
    };
    const createdIds: string[] = [];
    for (let index = 0; index < 51; index += 1) {
      const response = await app.request('/v1/beasts/agents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          definitionId: 'design-interview',
          initAction: {
            kind: 'design-interview',
            command: '/interview',
            config: { goal: `goal-${index}` },
          },
          initConfig: { goal: `goal-${index}` },
          autoDispatch: false,
        }),
      });
      expect(response.status).toBe(201);
      const body = await response.json() as { data: { id: string } };
      createdIds.push(body.data.id);
    }

    const firstResponse = await app.request('/v1/beasts/agents', { headers });
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as { data: { agents: Array<{ id: string }>; nextCursor?: string } };
    expect(first.data.agents).toHaveLength(50);
    expect(first.data.nextCursor).toEqual(expect.any(String));
    const secondResponse = await app.request(
      `/v1/beasts/agents?cursor=${encodeURIComponent(first.data.nextCursor ?? '')}`,
      { headers },
    );
    const second = await secondResponse.json() as { data: { agents: Array<{ id: string }>; nextCursor?: string } };
    expect(second.data.agents).toHaveLength(1);
    expect(second.data.nextCursor).toBeUndefined();
    expect([...first.data.agents, ...second.data.agents].map(({ id }) => id).sort()).toEqual(createdIds.sort());

    for (const path of [
      '/v1/beasts/agents?limit=201',
      '/v1/beasts/agents?limit=1.5',
      '/v1/beasts/agents?cursor=',
      '/v1/beasts/agents?cursor=not-a-cursor',
    ]) {
      expect((await app.request(path, { headers })).status).toBe(400);
    }
  });

  it('dispatches chunk-plan tracked agents during creation when init config is complete', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
            ...DOCS_POLICY,
          },
          chatSessionId: createdSession.data.id,
        },
        initConfig: {
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
          ...DOCS_POLICY,
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
        events: AgentEvent[];
      };
    };

    expect(detail.data.agent.status).toBe('running');
    expect(detail.data.agent.chatSessionId).toBe(createdSession.data.id);
    expect(detail.data.agent.dispatchRunId).toBeTruthy();
    expectEventsToIncludeTypes(detail.data.events, [
      'agent.created',
      'agent.chat.bound',
      'agent.command.sent',
      'agent.dispatch.linked',
    ]);

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

  it('creates startable deferred tracked agents when auto dispatch is disabled', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: 'martin-loop',
          config: {
            provider: 'claude',
            objective: 'Start later',
            chunkDirectory: 'docs/chunks',
            ...CODING_POLICY,
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Start later',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
        },
        executionMode: 'container',
        autoDispatch: false,
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string; dispatchRunId?: string } };
    expect(created.data.status).toBe('stopped');
    expect(created.data.dispatchRunId).toBeUndefined();

    const startResponse = await app.request(`/v1/beasts/agents/${created.data.id}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(startResponse.status).toBe(200);
    const started = await startResponse.json() as { data: { trackedAgentId?: string; status: string; executionMode: string } };
    expect(started.data.trackedAgentId).toBe(created.data.id);
    expect(started.data.status).toBe('running');
    expect(started.data.executionMode).toBe('container');
  });

  it('returns tracked agent detail including init metadata and linked run id', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
            ...CODING_POLICY,
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Ship route integration',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
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
          ...CODING_POLICY,
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
        events: AgentEvent[];
      };
    };

    expect(detailBody.data.agent.id).toBe(createdAgent.data.id);
    expect(detailBody.data.agent.initAction.kind).toBe('martin-loop');
    expect(detailBody.data.agent.dispatchRunId).toBe(createdRun.data.id);
    expectEventsToIncludeTypes(detailBody.data.events, ['agent.created']);
  });

  it('resumes a stopped tracked agent by creating a new run attempt on the linked run', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
            ...CODING_POLICY,
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Resume from dashboard',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
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
          ...CODING_POLICY,
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

  it('stops initializing tracked agents without a linked run', async () => {
    const { app } = createStandaloneAgentApp();
    const operatorToken = TEST_SUPER_SECRET_OPERATOR_TOKEN;
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
          config: { goal: 'Stop from dashboard', ...DOCS_POLICY },
          chatSessionId: 'sess-1',
        },
        initConfig: { goal: 'Stop from dashboard', ...DOCS_POLICY },
        chatSessionId: 'sess-1',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string } };
    expect(created.data.status).toBe('initializing');

    const stopResponse = await app.request(`/v1/beasts/agents/${created.data.id}/stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(stopResponse.status).toBe(200);
    const stopped = await stopResponse.json() as { data: { id: string; status: string } };
    expect(stopped.data.id).toBe(created.data.id);
    expect(stopped.data.status).toBe('stopped');

    const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const detail = await detailResponse.json() as {
      data: {
        agent: { status: string };
        events: AgentEvent[];
      };
    };
    expect(detail.data.agent.status).toBe('stopped');
    expectEventsToIncludeTypes(detail.data.events, ['agent.stop.requested']);
  });

  it('starts and restarts stopped tracked agents through agent-specific endpoints', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
            objective: 'Restart from dashboard',
            chunkDirectory: 'docs/chunks',
            ...CODING_POLICY,
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Restart from dashboard',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
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
          objective: 'Restart from dashboard',
          chunkDirectory: 'docs/chunks',
          ...CODING_POLICY,
        },
        executionMode: 'process',
        startNow: true,
      }),
    });
    expect(createRunResponse.status).toBe(201);
    const createdRun = await createRunResponse.json() as { data: { id: string } };

    const stopResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(stopResponse.status).toBe(200);

    const startResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/start`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(startResponse.status).toBe(200);
    const started = await startResponse.json() as { data: { id: string; attemptCount: number; status: string } };
    expect(started.data.id).toBe(createdRun.data.id);
    expect(started.data.attemptCount).toBe(2);
    expect(started.data.status).toBe('running');

    const restartResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/restart`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(restartResponse.status).toBe(200);
    const restarted = await restartResponse.json() as { data: { id: string; attemptCount: number; status: string } };
    expect(restarted.data.id).toBe(createdRun.data.id);
    expect(restarted.data.attemptCount).toBe(3);
    expect(restarted.data.status).toBe('running');
  });

  it('kills a running tracked agent by killing its linked run', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createAgentResponse = await app.request('/v1/beasts/agents', {
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
            ...DOCS_POLICY,
          },
        },
        initConfig: {
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
          ...DOCS_POLICY,
        },
      }),
    });
    expect(createAgentResponse.status).toBe(201);
    const createdAgent = await createAgentResponse.json() as { data: { id: string; status: string; dispatchRunId?: string } };
    expect(createdAgent.data.status).toBe('running');
    expect(createdAgent.data.dispatchRunId).toBeTruthy();

    const killResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/kill`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(killResponse.status).toBe(200);
    const killed = await killResponse.json() as { data: { id: string; status: string; stopReason?: string } };
    expect(killed.data.id).toBe(createdAgent.data.dispatchRunId);
    expect(killed.data.status).toBe('stopped');
    expect(killed.data.stopReason).toBe('operator_kill');

    const detailResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const detail = await detailResponse.json() as {
      data: {
        agent: { status: string };
        events: AgentEvent[];
      };
    };
    expectEventsToIncludeTypes(detail.data.events, ['agent.kill.requested']);
  });

  it('returns 409 on a stale/double kill request instead of re-killing an already-stopped linked run', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    const createAgentResponse = await app.request('/v1/beasts/agents', {
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
            ...DOCS_POLICY,
          },
        },
        initConfig: {
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
          ...DOCS_POLICY,
        },
      }),
    });
    expect(createAgentResponse.status).toBe(201);
    const createdAgent = await createAgentResponse.json() as { data: { id: string; status: string; dispatchRunId?: string } };
    expect(createdAgent.data.status).toBe('running');

    const firstKillResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/kill`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(firstKillResponse.status).toBe(200);
    const firstKilled = await firstKillResponse.json() as { data: { status: string; stopReason?: string } };
    expect(firstKilled.data.status).toBe('stopped');
    expect(firstKilled.data.stopReason).toBe('operator_kill');

    const detailResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const detail = await detailResponse.json() as { data: { agent: { status: string } } };
    expect(detail.data.agent.status).toBe('stopped');

    // A stale/double-click kill (e.g. the operator clicks Kill twice, or the request is
    // retried after the agent already stopped) must not be allowed to re-run the executor's
    // kill against an already-terminal run and stomp its stop reason.
    const secondKillResponse = await app.request(`/v1/beasts/agents/${createdAgent.data.id}/kill`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(secondKillResponse.status).toBe(409);
    expect(await secondKillResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_KILLABLE',
        message: `Tracked agent '${createdAgent.data.id}' is not running`,
      },
    });
  });

  it('returns 409 when killing a tracked agent that has no linked run', async () => {
    const { app } = createStandaloneAgentApp();
    const operatorToken = TEST_SUPER_SECRET_OPERATOR_TOKEN;
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
          config: { goal: 'Kill without a linked run', ...DOCS_POLICY },
        },
        initConfig: { goal: 'Kill without a linked run', ...DOCS_POLICY },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string } };

    const killResponse = await app.request(`/v1/beasts/agents/${created.data.id}/kill`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(killResponse.status).toBe(409);
    expect(await killResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_KILLABLE',
        message: `Tracked agent '${created.data.id}' has no linked run to kill`,
      },
    });
  });

  it('returns 404 when killing an unknown tracked agent', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();

    const killResponse = await app.request('/v1/beasts/agents/agent-missing/kill', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(killResponse.status).toBe(404);
    expect(await killResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_FOUND',
        message: "Tracked agent 'agent-missing' was not found",
      },
    });
  });

  it('soft-deletes stopped tracked agents while keeping them visible for audit filters', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
          config: { goal: 'Delete from dashboard', outputPath: 'docs/delete-design.md', ...DOCS_POLICY },
        },
        initConfig: { goal: 'Delete from dashboard', outputPath: 'docs/delete-design.md', ...DOCS_POLICY },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string } };

    const stopResponse = await app.request(`/v1/beasts/agents/${created.data.id}/stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(stopResponse.status).toBe(200);

    const deleteResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await app.request('/v1/beasts/agents', {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const list = await listResponse.json() as { data: { agents: Array<{ id: string; status: string }> } };
    expect(list.data.agents.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: created.data.id, status: 'deleted' },
    ]);

    const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as { data: { agent: { id: string; status: string } } };
    expect(detail.data.agent).toMatchObject({ id: created.data.id, status: 'deleted' });

    const stopAgainResponse = await app.request(`/v1/beasts/agents/${created.data.id}/stop`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    expect(stopAgainResponse.status).toBe(409);
    expect(await stopAgainResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_DELETED',
        message: `Tracked agent '${created.data.id}' has been deleted`,
      },
    });
  });

  it.each(['failed', 'completed'] as const)(
    'soft-deletes %s tracked agents through the dashboard route',
    async (status) => {
      const { app, operatorToken, agents } = createIntegratedBeastApp();
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
            config: { goal: `Delete ${status} from dashboard`, ...DOCS_POLICY },
          },
          initConfig: { goal: `Delete ${status} from dashboard`, ...DOCS_POLICY },
          autoDispatch: false,
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { data: { id: string } };
      agents.updateAgent(created.data.id, { status });

      const deleteResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });
      expect(deleteResponse.status).toBe(204);

      const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });
      expect(detailResponse.status).toBe(200);
      const detail = await detailResponse.json() as { data: { agent: { id: string; status: string } } };
      expect(detail.data.agent).toMatchObject({ id: created.data.id, status: 'deleted' });
    },
  );

  it('returns a typed 409 without recording delete request events for running tracked agents', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
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
          config: { goal: 'Do not delete running agents', outputPath: 'docs/running-delete.md', ...DOCS_POLICY },
        },
        initConfig: { goal: 'Do not delete running agents', outputPath: 'docs/running-delete.md', ...DOCS_POLICY },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string } };

    const deleteResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(deleteResponse.status).toBe(409);
    expect(await deleteResponse.json()).toEqual({
      error: {
        code: 'TRACKED_AGENT_NOT_DELETABLE',
        message: `Tracked agent '${created.data.id}' must be stopped, failed, or completed to delete`,
      },
    });

    const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });
    const detail = await detailResponse.json() as { data: { events: Array<{ type: string }> } };
    expect(detail.data.events.some((event) => event.type === 'agent.delete.requested')).toBe(false);
  });

  it('patches tracked agent identity and module configuration', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: ['Bearer', operatorToken].join(' '),
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
          config: {},
        },
        initConfig: {
          identity: { name: 'Old name', description: 'Old description' },
          workflow: { workflowType: 'design-interview' },
          ...DOCS_POLICY,
        },
        autoDispatch: false,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string } };

    const patchResponse = await app.request(`/v1/beasts/agents/${created.data.id}/config`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        name: 'Updated name',
        description: 'Updated description',
        moduleConfig: { firewall: false, memory: true },
      }),
    });

    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as {
      data: { name?: string; initConfig: { identity: { name: string; description: string }; workflow: unknown }; moduleConfig: unknown };
    };
    expect(patched.data.name).toBe('Updated name');
    expect(patched.data.initConfig.identity).toEqual({ name: 'Updated name', description: 'Updated description' });
    expect(patched.data.initConfig.workflow).toEqual({ workflowType: 'design-interview' });
    expect(patched.data.moduleConfig).toEqual({ firewall: false, memory: true });

    const detailResponse = await app.request(`/v1/beasts/agents/${created.data.id}`, {
      headers: { authorization: ['Bearer', operatorToken].join(' ') },
    });
    const detail = await detailResponse.json() as { data: { events: AgentEvent[] } };
    expectEventsToIncludeTypes(detail.data.events, ['agent.config.updated']);
  });

  it('preserves started run snapshots and applies module edits through a replacement restart', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: ['Bearer', operatorToken].join(' '),
      'content-type': 'application/json',
    };

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
            ...DOCS_POLICY,
          },
        },
        initConfig: {
          identity: { name: 'Linked run agent' },
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
          ...DOCS_POLICY,
          modules: { firewall: true, memory: false },
        },
        moduleConfig: { firewall: true, memory: false },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; dispatchRunId?: string } };
    expect(created.data.dispatchRunId).toBeTruthy();

    const patchResponse = await app.request('/v1/beasts/agents/' + created.data.id + '/config', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        moduleConfig: { firewall: false, memory: true },
      }),
    });
    expect(patchResponse.status).toBe(200);

    const runResponse = await app.request('/v1/beasts/runs/' + created.data.dispatchRunId, {
      headers: { authorization: ['Bearer', operatorToken].join(' ') },
    });
    expect(runResponse.status).toBe(200);
    const runDetail = await runResponse.json() as { data: { run: { configSnapshot: { modules?: unknown } } } };
    expect(runDetail.data.run.configSnapshot.modules).toEqual({ firewall: true, memory: false });

    const restartResponse = await app.request('/v1/beasts/agents/' + created.data.id + '/restart', {
      method: 'POST',
      headers: { authorization: ['Bearer', operatorToken].join(' ') },
    });
    expect(restartResponse.status).toBe(200);
    const restarted = await restartResponse.json() as { data: { id: string; configSnapshot: { modules?: unknown } } };
    expect(restarted.data.id).not.toBe(created.data.dispatchRunId);
    expect(restarted.data.configSnapshot.modules).toEqual({ firewall: false, memory: true });
  });

  it('returns 404 for unknown tracked agents', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();

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

  it('rate-limits agent creation requests', async () => {
    const { app, operatorToken } = createIntegratedBeastApp({ rateLimitMax: 2 });
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };
    const body = JSON.stringify({
      definitionId: 'design-interview',
      initAction: {
        kind: 'design-interview',
        command: '/interview',
        config: { ...DOCS_POLICY },
      },
      initConfig: { ...DOCS_POLICY },
      autoDispatch: false,
    });

    const r1 = await app.request('/v1/beasts/agents', { method: 'POST', headers, body });
    const r2 = await app.request('/v1/beasts/agents', { method: 'POST', headers, body });
    const r3 = await app.request('/v1/beasts/agents', { method: 'POST', headers, body });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(429);
  });

  it('rate-limits tracked-agent lifecycle action requests', async () => {
    const { app, operatorToken } = createIntegratedBeastApp({ rateLimitMax: 1 });
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
          config: {
            goal: 'Rate-limit lifecycle action',
            outputPath: 'docs/design.md',
          },
        },
        initConfig: {
          goal: 'Rate-limit lifecycle action',
          outputPath: 'docs/design.md',
        },
        autoDispatch: false,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string } };

    const firstStart = await app.request(`/v1/beasts/agents/${created.data.id}/start`, {
      method: 'POST',
      headers,
    });
    const secondStart = await app.request(`/v1/beasts/agents/${created.data.id}/start`, {
      method: 'POST',
      headers,
    });

    expect(firstStart.status).toBe(200);
    expect(secondStart.status).toBe(429);
    expect(await secondStart.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
      },
    });
  });

  it('returns an explicit error when dispatch throws after creating the tracked agent', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

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
            ...DOCS_POLICY,
            invalidField: 'this-will-fail-schema',
          },
        },
        initConfig: {
          invalidField: 'this-will-fail-schema',
          ...DOCS_POLICY,
        },
      }),
    });

    expect(createResponse.status).toBe(409);
    const created = await createResponse.json() as {
      error: {
        code: string;
        message: string;
        details: { agentId: string; dispatchError: string; agent: { id: string; status: string } };
      };
    };
    expect(created.error.code).toBe('AGENT_DISPATCH_FAILED');
    expect(created.error.message).toContain('Dispatch failed for tracked agent');
    expect(created.error.details.agentId).toBeTruthy();
    expect(created.error.details.dispatchError).toBe(SAFE_DISPATCH_FAILURE_MESSAGE);
    expect(created.error.message).not.toContain('outputDir');
    expect(created.error.details.agent.status).toBe('failed');

    const detailResponse = await app.request(`/v1/beasts/agents/${created.error.details.agentId}`, {
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const detail = await detailResponse.json() as {
      data: {
        agent: { status: string };
        events: AgentEvent[];
      };
    };
    expect(detail.data.agent.status).toBe('failed');
    expectEventsToIncludeTypes(detail.data.events, ['agent.dispatch.failed']);
  });

  it('does not expose unexpected dispatch exception details in logs, events, or responses', async () => {
    mkdirSync(TMP, { recursive: true });
    const dbPath = join(TMP, 'redacted-dispatch-errors.db');
    const repository = new SQLiteBeastRepository(dbPath);
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const exceptionSecret = 'dispatch-secret-value-1234567890';
    const requestSecret = 'request-secret-value-0987654321';
    const sensitiveCommand = '/opt/private/bin/provider --token super-secret';
    const rawLinkedRun = repository.createRun({
      definitionId: 'design-interview',
      definitionVersion: 1,
      status: 'running',
      executionMode: 'process',
      configSnapshot: { token: requestSecret },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-03-11T00:00:00.000Z',
      attemptCount: 0,
    });
    const runs = {
      getRun: vi.fn(() => rawLinkedRun),
      start: vi.fn(),
      stop: vi.fn(async () => ({ ...rawLinkedRun, status: 'stopped' })),
      kill: vi.fn(),
      restart: vi.fn(),
      sanitizeRunForResponse: vi.fn((run: typeof rawLinkedRun) => ({ ...run, configSnapshot: {} })),
    };
    const dispatch = {
      createRun: vi.fn(async () => {
        throw new Error(`Provider spawn failed: token=${exceptionSecret}`);
      }),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', agentRoutes({
      agents,
      dispatch: dispatch as never,
      runs: runs as never,
      operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('authorization', ['Bearer', TEST_SUPER_SECRET_OPERATOR_TOKEN].join(' '));

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: sensitiveCommand,
          config: {
            provider: 'claude',
            objective: 'Redact dispatch failure',
            chunkDirectory: 'docs/chunks',
            token: requestSecret,
          },
        },
        initConfig: {
          provider: 'claude',
          objective: 'Redact dispatch failure',
          chunkDirectory: 'docs/chunks',
          token: requestSecret,
          identity: { name: requestSecret },
        },
      }),
    });

    expect(response.status).toBe(409);
    const responseBody = await response.json() as {
      error: { message: string; details: { agentId: string; dispatchError: string } };
    };
    agents.updateAgent(responseBody.error.details.agentId, {
      status: 'stopped',
    });
    agents.appendEvent(responseBody.error.details.agentId, {
      level: 'error',
      type: 'agent.command.sent',
      message: sensitiveCommand,
      payload: { command: sensitiveCommand },
    });
    agents.appendEvent(responseBody.error.details.agentId, {
      level: 'error',
      type: 'agent.dispatch.failed',
      message: `Provider spawn failed: token=${exceptionSecret}`,
      payload: { error: exceptionSecret, runId: 'run_historical-secret-link' },
    });
    agents.appendEvent(responseBody.error.details.agentId, {
      level: 'info',
      type: 'agent.dispatch.linked',
      message: 'Linked Beast run run_historical-secret-link',
      payload: { runId: 'run_historical-secret-link' },
    });
    const db = new Database(dbPath);
    db.prepare('UPDATE tracked_agent_events SET payload = ? WHERE agent_id = ? AND type = ?')
      .run('{"secret":"must-not-leak"', responseBody.error.details.agentId, 'agent.dispatch.failed');
    db.close();
    const corruptWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const detailResponse = await app.request(`/v1/beasts/agents/${responseBody.error.details.agentId}`, { headers });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as {
      data: { agent: Record<string, unknown>; events: AgentEvent[] };
    };
    expect(detail.data.agent).not.toHaveProperty('dispatchRunId');
    expect(detail.data.agent).not.toHaveProperty('name');
    expect(JSON.stringify(detail.data.events)).not.toContain('run_historical-secret-link');
    expect(corruptWarn).not.toHaveBeenCalledWith(expect.stringContaining('must-not-leak'));
    corruptWarn.mockRestore();

    const patchResponse = await app.request(`/v1/beasts/agents/${responseBody.error.details.agentId}/config`, {
      method: 'PATCH',
      headers,
      body: '{}',
    });
    expect(patchResponse.status).toBe(200);
    const patchedAgent = await patchResponse.json() as { data: Record<string, unknown> };
    const stopResponse = await app.request(`/v1/beasts/agents/${responseBody.error.details.agentId}/stop`, {
      method: 'POST',
      headers,
    });
    expect(stopResponse.status).toBe(200);
    const stoppedAgent = await stopResponse.json() as { data: Record<string, unknown> };
    agents.appendEvent(responseBody.error.details.agentId, {
      level: 'info',
      type: 'agent.dispatch.recovered',
      message: 'Tracked agent dispatch recovered',
      payload: {},
    });
    const recoveredDetailResponse = await app.request(
      `/v1/beasts/agents/${responseBody.error.details.agentId}`,
      { headers },
    );
    const recoveredDetail = await recoveredDetailResponse.json() as {
      data: { events: AgentEvent[] };
    };
    expect(JSON.stringify(recoveredDetail.data.events)).not.toContain(exceptionSecret);
    expect(JSON.stringify(recoveredDetail.data.events)).not.toContain(sensitiveCommand);
    expect(JSON.stringify(recoveredDetail.data.events)).not.toContain('run_historical-secret-link');
    agents.updateAgent(responseBody.error.details.agentId, {
      status: 'running',
      dispatchRunId: rawLinkedRun.id,
    });
    const linkedStopResponse = await app.request(`/v1/beasts/agents/${responseBody.error.details.agentId}/stop`, {
      method: 'POST',
      headers,
    });
    expect(linkedStopResponse.status).toBe(200);
    const linkedStoppedRun = await linkedStopResponse.json() as { data: Record<string, unknown> };
    expect(linkedStoppedRun.data).toMatchObject({ configSnapshot: {} });
    expect(runs.sanitizeRunForResponse).toHaveBeenCalled();
    const exposedSurfaces = JSON.stringify({
      responseBody,
      agent: detail.data.agent,
      events: detail.data.events,
      mutationResponses: [patchedAgent, stoppedAgent, linkedStoppedRun],
      logs: consoleError.mock.calls,
    });
    expect(responseBody.error.details.dispatchError).toBe(SAFE_DISPATCH_FAILURE_MESSAGE);
    expect(detail.data.agent).toMatchObject({
      initAction: { kind: 'martin-loop', command: '[REDACTED]', config: {} },
      initConfig: {},
    });
    expect(detail.data.agent).not.toHaveProperty('dispatchRunId');
    expect(exposedSurfaces).not.toContain(exceptionSecret);
    expect(exposedSurfaces).not.toContain('Provider spawn failed');
    expect(exposedSurfaces).not.toContain(requestSecret);
    expect(exposedSurfaces).not.toContain(sensitiveCommand);
    expect(exposedSurfaces).not.toContain('/opt/private/bin/provider');
    expect(exposedSurfaces).not.toContain('super-secret');
    consoleError.mockRestore();
  });

  it('redacts a failed tracked agent when auto-dispatch resolves instead of throwing', async () => {
    mkdirSync(TMP, { recursive: true });
    const repository = new SQLiteBeastRepository(join(TMP, 'redacted-resolved-dispatch-failure.db'));
    const agents = new AgentService(repository, () => '2026-03-11T00:00:00.000Z');
    const runs = { getRun: vi.fn(), start: vi.fn(), stop: vi.fn(), kill: vi.fn(), restart: vi.fn() };
    const requestSecret = 'resolved-dispatch-secret-1234567890';
    const sensitiveCommand = '/opt/private/bin/provider --token resolved-secret';
    const dispatch = {
      createRun: vi.fn(async () => {
        const agent = agents.listAgents()[0];
        if (!agent) throw new Error('Expected the route to create a tracked agent before dispatch');
        agents.updateAgent(agent.id, { status: 'failed' });
        agents.appendEvent(agent.id, {
          level: 'error',
          type: 'agent.dispatch.failed',
          message: SAFE_DISPATCH_FAILURE_MESSAGE,
          payload: { error: SAFE_DISPATCH_FAILURE_MESSAGE },
        });
        return { id: 'run_failed', status: 'failed' };
      }),
    };
    const app = new Hono();
    app.onError(errorHandler);
    app.route('/', agentRoutes({
      agents,
      dispatch: dispatch as never,
      runs: runs as never,
      operatorToken: TEST_SUPER_SECRET_OPERATOR_TOKEN,
      security: new TransportSecurityService(),
    }));
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('authorization', ['Bearer', TEST_SUPER_SECRET_OPERATOR_TOKEN].join(' '));

    const response = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'martin-loop',
        initAction: {
          kind: 'martin-loop',
          command: sensitiveCommand,
          config: { provider: 'claude', token: requestSecret },
        },
        initConfig: { provider: 'claude', token: requestSecret },
      }),
    });

    expect(response.status).toBe(201);
    const responseBody = await response.json() as { data: Record<string, unknown> };
    expect(responseBody.data).toMatchObject({
      status: 'failed',
      initAction: { kind: 'martin-loop', command: '[REDACTED]', config: {} },
      initConfig: {},
    });
    expect(responseBody.data).not.toHaveProperty('dispatchRunId');
    const exposedResponse = JSON.stringify(responseBody);
    expect(exposedResponse).not.toContain(requestSecret);
    expect(exposedResponse).not.toContain(sensitiveCommand);
  });

  it('allows starting failed tracked agents via the start endpoint', async () => {
    const { app, operatorToken } = createIntegratedBeastApp();
    const headers = {
      authorization: `Bearer ${operatorToken}`,
      'content-type': 'application/json',
    };

    // Create a chunk-plan agent with valid config — dispatch will succeed and start
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
            ...DOCS_POLICY,
          },
        },
        initConfig: {
          designDocPath: 'docs/plans/design.md',
          outputDir: 'docs/chunks',
          ...DOCS_POLICY,
        },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { data: { id: string; status: string; dispatchRunId?: string } };
    expect(created.data.status).toBe('running');
    expect(created.data.dispatchRunId).toBeTruthy();

    // Stop the run to get to 'stopped' state, then kill the run to get agent to 'failed'
    await app.request(`/v1/beasts/runs/${created.data.dispatchRunId}/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    // Verify the agent is stopped, then use the restart endpoint which already works for stopped.
    // The real test: use the start endpoint with a failed agent created by an auto-dispatch failure.
    const failedResponse = await app.request('/v1/beasts/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        definitionId: 'chunk-plan',
        initAction: {
          kind: 'chunk-plan',
          command: '/plan',
          config: { ...DOCS_POLICY },
        },
        initConfig: {
          invalidField: 'will-fail',
          ...DOCS_POLICY,
        },
      }),
    });
    expect(failedResponse.status).toBe(409);
    const failedAgent = await failedResponse.json() as {
      error: { details: { agentId: string; agent: { status: string } } };
    };
    expect(failedAgent.error.details.agent.status).toBe('failed');

    // Starting a failed agent without a dispatchRunId will try dispatchDetachedAgent
    // which will also fail (same bad config), but the status guard should NOT be the blocker
    const startResponse = await app.request(`/v1/beasts/agents/${failedAgent.error.details.agentId}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    // The start attempt goes through the status guard (no 409) but dispatch may fail (500)
    // At minimum it should NOT be 409 TRACKED_AGENT_NOT_STARTABLE
    expect(startResponse.status).not.toBe(409);
  });
});
