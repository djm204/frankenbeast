import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChatApp } from '../../../src/http/chat-app.js';
import { verifySessionToken } from '../../../src/http/ws-chat-auth.js';
import type { ChatSession } from '../../../src/chat/types.js';
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

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/http-chat');

describe('Chat HTTP Routes', () => {
  let app: ReturnType<typeof createChatApp>;
  let llmComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    llmComplete = vi.fn().mockResolvedValue('Mock reply');
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
    });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // --- Health check ---

  it('GET /health returns 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('allows configured dashboard origins to call authenticated API routes directly', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      operatorToken: 'operator-token',
      allowedOrigins: ['http://127.0.0.1:5173'],
    });

    const preflight = await app.request('/v1/chat/sessions', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization, content-type',
      },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'http://127.0.0.1:5173',
        authorization: 'Bearer operator-token',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  it('does not emit CORS headers for unconfigured origins', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      operatorToken: 'operator-token',
      allowedOrigins: ['http://127.0.0.1:5173'],
    });

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'https://evil.example',
        authorization: 'Bearer operator-token',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not treat wildcard CORS origins as credentialed allowlists', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      operatorToken: 'operator-token',
      allowedOrigins: ['*'],
    });

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'https://dashboard.example',
        authorization: 'Bearer operator-token',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  // --- Create session ---

  it('POST /v1/chat/sessions creates a session', async () => {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'my-project' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.projectId).toBe('my-project');
    expect(body.data.socketToken).toEqual(expect.any(String));
  });

  it('GET /v1/chat/sessions lists session summaries and filters by project', async () => {
    await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'alpha' }),
    });
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'beta' }),
    });
    const { data: latest } = await createRes.json();

    const response = await app.request('/v1/chat/sessions?projectId=beta');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.sessions).toEqual([
      expect.objectContaining({
        id: latest.id,
        projectId: 'beta',
        messageCount: 0,
      }),
    ]);
  });

  // --- Get session ---

  it('GET /v1/chat/sessions/:id returns session', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(created.id);
    expect(body.data.socketToken).toEqual(expect.any(String));
    expect(body.data.transcript).toEqual([]);
    expect(body.data.state).toBe('active');
  });

  it('issues socket tokens that are scoped to the session id', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const secret = 'test-secret-for-http-routes';
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('Mock reply') },
      projectName: 'test-project',
      sessionTokenSecret: secret,
    });

    const res = await app.request(`/v1/chat/sessions/${created.id}`);
    const body = await res.json();
    expect(
      verifySessionToken({
        secret,
        sessionId: created.id,
        token: body.data.socketToken,
      }),
    ).toBe(true);
  });

  it('GET /v1/chat/sessions/:id returns 404 for unknown ID', async () => {
    const res = await app.request('/v1/chat/sessions/nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // --- Submit message ---

  it('POST /v1/chat/sessions/:id/messages submits a turn', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.outcome).toBeDefined();
    expect(body.data.tier).toBeDefined();
    expect(body.data.state).toBe('active');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`);
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.transcript).toHaveLength(2);
    expect(sessionBody.data.state).toBe('active');
  });

  it('runs a Beast interview in chat and dispatches a persisted Beast run', async () => {
    const repository = new SQLiteBeastRepository(join(TMP, 'beasts.db'));
    const logStore = new BeastLogStore(join(TMP, 'beast-logs'));
    const catalog = new BeastCatalogService();
    const metrics = new PrometheusBeastMetrics();
    const agents = new AgentService(repository);
    const fakeContainerSupervisor: ProcessSupervisorLike = {
      spawn: vi.fn(async (_spec: BeastProcessSpec, _callbacks: ProcessCallbacks) => ({ pid: 8765 })),
      stop: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    };
    const containerExecutor = new ContainerBeastExecutor({
      repository,
      logStore,
      eventBus: new BeastEventBus(),
      supervisorFactory: () => fakeContainerSupervisor,
      policy: { ...DEFAULT_SANDBOX_POLICY, image: 'fbeast/sandbox:test', workspaceHostPath: TMP },
    });
    const executors = {
      process: {
        start: vi.fn(async (run, _definition) => {
          const attempt = repository.createAttempt(run.id, {
            status: 'running',
            pid: 4321,
            startedAt: '2026-03-10T00:01:00.000Z',
            executorMetadata: { backend: 'process' },
          });
          repository.appendEvent(run.id, {
            attemptId: attempt.id,
            type: 'attempt.started',
            payload: { pid: 4321 },
            createdAt: '2026-03-10T00:01:00.000Z',
          });
          await logStore.append(run.id, attempt.id, 'stdout', 'started from chat');
          return attempt;
        }),
        stop: vi.fn(),
        kill: vi.fn(),
      },
      container: containerExecutor,
    };
    app = createChatApp({
      sessionStoreDir: join(TMP, 'chat-with-beasts'),
      llm: { complete: llmComplete },
      projectName: 'test-project',
      beastControl: {
        catalog,
        dispatch: new BeastDispatchService(repository, catalog, executors, metrics, logStore),
        runs: new BeastRunService(repository, catalog, executors, metrics, logStore),
        interviews: new BeastInterviewService(repository, catalog),
        agents,
        metrics,
        security: new TransportSecurityService(),
        operatorToken: 'operator-token',
        eventBus: new BeastEventBus(),
        ticketStore: new SseConnectionTicketStore(),
        rateLimit: {
          windowMs: 60_000,
          max: 50,
        },
      },
    });

    const authHeaders = {
      'Content-Type': 'application/json',
      authorization: 'Bearer operator-token',
    };

    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const promptOneRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: 'spawn a martin beast', executionMode: 'container' }),
    });
    expect(promptOneRes.status).toBe(200);
    const promptOne = await promptOneRes.json();
    expect(promptOne.data.outcome.kind).toBe('reply');
    expect(promptOne.data.outcome.content).toContain('Which provider should run the martin loop?');

    const promptTwoRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: 'claude' }),
    });
    const promptTwo = await promptTwoRes.json();
    expect(promptTwo.data.outcome.content).toContain('What should the martin loop accomplish?');

    const promptThreeRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: 'Ship Beast monitoring' }),
    });
    const promptThree = await promptThreeRes.json();
    expect(promptThree.data.outcome.content).toContain('Which chunk directory should MartinLoop execute from?');

    const dispatchRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: 'docs/chunks' }),
    });
    const dispatchBody = await dispatchRes.json();
    expect(dispatchBody.data.outcome.kind).toBe('reply');
    expect(dispatchBody.data.outcome.content).toContain('Martin Loop');
    expect(dispatchBody.data.outcome.content).toContain('running');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`, {
      headers: { authorization: 'Bearer operator-token' },
    });
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.transcript.some((message: { content: string }) => message.content.includes('Ship Beast monitoring'))).toBe(true);
    expect(sessionBody.data.beastContext).toBeNull();

    const runsResponse = await app.request('/v1/beasts/runs', {
      headers: {
        authorization: 'Bearer operator-token',
      },
    });
    const runsBody = await runsResponse.json();
    expect(runsBody.data.runs).toHaveLength(1);
    expect(runsBody.data.runs[0]).toMatchObject({
      definitionId: 'martin-loop',
      dispatchedBy: 'chat',
      dispatchedByUser: `chat-session:${created.id}`,
      executionMode: 'container',
      status: 'running',
      containerId: expect.stringMatching(/^fbeast-run_/),
      containerRuntime: 'docker',
      image: 'fbeast/sandbox:test',
      containerImage: 'fbeast/sandbox:test',
      resourceSnapshot: { memory: '512m', cpus: '1.0', pidsLimit: 256 },
      workspaceContainerPath: '/workspace',
    });
    expect(fakeContainerSupervisor.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'docker' }),
      expect.any(Object),
    );
  });

  it('uses the default LLM-backed executor for code-request turns', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'implement the dashboard shell' }),
    });

    expect(res.status).toBe(200);
    expect(llmComplete).toHaveBeenCalledWith('implement the dashboard shell');
  });

  it('preserves session continuation semantics across repeated HTTP turns', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      sessionContinuation: true,
    });

    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'second' }),
    });

    expect(llmComplete).toHaveBeenNthCalledWith(2, 'second');
  });

  it('POST /v1/chat/sessions/:id/messages returns 404 for unknown session', async () => {
    const res = await app.request('/v1/chat/sessions/nonexistent/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // --- Approve action ---

  it('POST /v1/chat/sessions/:id/approve updates approval state', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const submitRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'run deployment' }),
    });
    expect(submitRes.status).toBe(200);
    const submitBody = await submitRes.json();
    expect(submitBody.data.outcome.kind).toBe('execute');
    expect(submitBody.data.state).toBe('pending_approval');

    const res = await app.request(`/v1/chat/sessions/${created.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('approved');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`);
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.state).toBe('approved');
    expect(sessionBody.data.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve is idempotent when no approval is pending', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const submitRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'run deployment' }),
    });
    expect(submitRes.status).toBe(200);

    const approveRes = await app.request(`/v1/chat/sessions/${created.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    expect(approveRes.status).toBe(200);
    expect((await approveRes.json()).data.state).toBe('approved');

    const retryRes = await app.request(`/v1/chat/sessions/${created.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    expect(retryRes.status).toBe(200);
    expect((await retryRes.json()).data.state).toBe('approved');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`);
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.state).toBe('approved');
    expect(sessionBody.data.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve handles state-only pending approvals', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-state-only-pending',
      projectId: 'proj',
      transcript: [],
      state: 'pending_approval',
      pendingApproval: null,
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    const sessionStore = {
      create: vi.fn(),
      get: vi.fn(() => session),
      save: vi.fn((updated: ChatSession) => Object.assign(session, updated)),
      list: vi.fn(() => [session.id]),
      listSessions: vi.fn(() => [session]),
      delete: vi.fn(),
    };
    const runtime = {
      run: vi.fn(async () => ({
        displayMessages: [{ kind: 'approval' as const, content: 'Approved.' }],
        events: [],
        pendingApproval: false,
        state: 'approved',
        tier: null,
        transcript: [],
      })),
    };

    app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      sessionTokenSecret: 'test-secret-for-http-routes',
    });

    const res = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).data.state).toBe('approved');
    expect(runtime.run).toHaveBeenCalledWith('/approve', expect.objectContaining({
      pendingApproval: true,
    }));
    expect(session.state).toBe('approved');
    expect(session.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve does not downgrade approved sessions when runtime reports active', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-active-result',
      projectId: 'proj',
      transcript: [],
      state: 'pending_approval',
      pendingApproval: { description: 'Deploy?', requestedAt: now },
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    const sessionStore = {
      create: vi.fn(),
      get: vi.fn(() => session),
      save: vi.fn((updated: ChatSession) => Object.assign(session, updated)),
      list: vi.fn(() => [session.id]),
      listSessions: vi.fn(() => [session]),
      delete: vi.fn(),
    };
    const runtime = {
      run: vi.fn(async () => ({
        displayMessages: [{ kind: 'status' as const, content: 'Nothing pending.' }],
        events: [],
        pendingApproval: false,
        state: 'active',
        tier: null,
        transcript: [],
      })),
    };

    app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      sessionTokenSecret: 'test-secret-for-http-routes',
    });

    const res = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).data.state).toBe('approved');
    expect(session.state).toBe('approved');
    expect(session.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve clears pending approval when rejected', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const submitRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'run deployment' }),
    });
    expect(submitRes.status).toBe(200);

    const res = await app.request(`/v1/chat/sessions/${created.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('rejected');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`);
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.state).toBe('rejected');
    expect(sessionBody.data.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve returns 404 for unknown session', async () => {
    const res = await app.request('/v1/chat/sessions/nonexistent/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // --- Validation errors ---

  it('returns 422 for missing required fields on create session', async () => {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBeDefined();
    expect(body.error.details).toBeDefined();
  });

  it('returns 422 for missing content on submit message', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 for missing approved on approve', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown fields (strict validation)', async () => {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj', extraField: 'bad' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"projectId":',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('MALFORMED_JSON');
  });

  it('enforces request size limits', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(20_000) }),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  // --- Success envelope ---

  it('all success responses use { data: ... } envelope', async () => {
    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const createBody = await createRes.json();
    expect(createBody).toHaveProperty('data');
    expect(createBody).not.toHaveProperty('error');

    const getRes = await app.request(`/v1/chat/sessions/${createBody.data.id}`);
    const getBody = await getRes.json();
    expect(getBody).toHaveProperty('data');
    expect(getBody).not.toHaveProperty('error');
  });

  // --- Error structure ---

  it('error responses use { error: { code, message } } structure', async () => {
    const res = await app.request('/v1/chat/sessions/nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toEqual(expect.any(String));
    expect(body.error.message).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('data');
  });

  it('sets an x-request-id response header', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-request-id')).toEqual(expect.any(String));
  });

  describe('chat route operator auth', () => {
    const baseChatOpts = () => ({
      sessionStoreDir: TMP,
      llm: { complete: vi.fn().mockResolvedValue('Mock reply') },
      projectName: 'test-project',
    });

    it('rejects unauthenticated chat requests when an operator token is configured', async () => {
      const app = createChatApp({ ...baseChatOpts(), operatorToken: 'secret-op-token' });
      const res = await app.request('/v1/chat/sessions', { method: 'POST', body: '{}' });
      expect(res.status).toBe(401);
    });

    it('accepts chat requests with a valid bearer operator token', async () => {
      const app = createChatApp({ ...baseChatOpts(), operatorToken: 'secret-op-token' });
      const res = await app.request('/v1/chat/sessions', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-op-token', 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).not.toBe(401);
    });

    it('keeps /health public', async () => {
      const app = createChatApp({ ...baseChatOpts(), operatorToken: 'secret-op-token' });
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });
  });
});
