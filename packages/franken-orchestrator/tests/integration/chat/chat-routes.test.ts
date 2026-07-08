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

import { testCredential } from '../../support/test-credentials.js';

const TEST_OPERATOR_TOKEN = testCredential('TEST_OPERATOR_TOKEN');
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
      operatorToken: TEST_OPERATOR_TOKEN,
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
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'http://127.0.0.1:5173',
        authorization: `Bearer ${TEST_OPERATOR_TOKEN}`,
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
      operatorToken: TEST_OPERATOR_TOKEN,
      allowedOrigins: ['http://127.0.0.1:5173'],
    });

    const preflight = await app.request('/v1/chat/sessions', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'https://evil.example',
        authorization: `Bearer ${TEST_OPERATOR_TOKEN}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('does not treat wildcard CORS origins as credentialed allowlists', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      operatorToken: TEST_OPERATOR_TOKEN,
      allowedOrigins: ['*'],
    });

    const response = await app.request('/v1/chat/sessions', {
      headers: {
        origin: 'https://dashboard.example',
        authorization: `Bearer ${TEST_OPERATOR_TOKEN}`,
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

    const secret = ['test', 'http', 'fixture'].join('-');
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
        operatorToken: TEST_OPERATOR_TOKEN,
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
      authorization: `Bearer ${TEST_OPERATOR_TOKEN}`,
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
      headers: { authorization: `Bearer ${TEST_OPERATOR_TOKEN}` },
    });
    const sessionBody = await sessionRes.json();
    expect(sessionBody.data.transcript.some((message: { content: string }) => message.content.includes('Ship Beast monitoring'))).toBe(true);
    expect(sessionBody.data.beastContext).toBeNull();

    const runsResponse = await app.request('/v1/beasts/runs', {
      headers: {
        authorization: `Bearer ${TEST_OPERATOR_TOKEN}`,
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

  it('rate limits repeated message submissions before invoking the runtime', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      chatRateLimit: { windowMs: 60_000, max: 1 },
    });

    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const allowed = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(allowed.status).toBe(200);

    const limited = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ content: 'second' }),
    });

    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it('uses the client address for unauthenticated rate limits even when auth headers vary', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      chatRateLimit: { windowMs: 60_000, max: 1 },
    });

    const firstCreate = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: firstSession } = await firstCreate.json();
    const secondCreate = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: secondSession } = await secondCreate.json();

    const allowed = await app.request(`/v1/chat/sessions/${firstSession.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Basic attacker-controlled-a',
        'x-frankenbeast-remote-address': '10.0.0.7',
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(allowed.status).toBe(200);

    const limited = await app.request(`/v1/chat/sessions/${secondSession.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Basic attacker-controlled-b',
        'x-frankenbeast-operator-token': 'attacker-controlled-c',
        'x-frankenbeast-remote-address': '10.0.0.7',
        'x-forwarded-for': '198.51.100.9',
      },
      body: JSON.stringify({ content: 'second' }),
    });

    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it('keys authenticated rate limits to the configured operator credential, not ignored auth headers', async () => {
    app = createChatApp({
      sessionStoreDir: TMP,
      llm: { complete: llmComplete },
      projectName: 'test-project',
      operatorToken: 'operator-a',
      chatRateLimit: { windowMs: 60_000, max: 1 },
    });

    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frankenbeast-operator-token': 'operator-a' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const allowed = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frankenbeast-operator-token': 'operator-a' },
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(allowed.status).toBe(200);

    const limited = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Basic ignored-attacker-value',
        'x-frankenbeast-operator-token': 'operator-a',
      },
      body: JSON.stringify({ content: 'second' }),
    });

    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(llmComplete).toHaveBeenCalledTimes(1);
  });

  it('shares one quota across message and approval mutations for the same principal', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-shared-mutation-quota',
      projectId: 'proj',
      transcript: [],
      state: 'active',
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
        displayMessages: [{ kind: 'reply' as const, content: 'done' }],
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
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
      chatRateLimit: { windowMs: 60_000, max: 1 },
    });

    const message = await app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frankenbeast-remote-address': '10.0.0.9' },
      body: JSON.stringify({ content: 'first' }),
    });
    expect(message.status).toBe(200);

    session.state = 'pending_approval';
    session.pendingApproval = { description: 'Deploy?', requestedAt: now };
    const approval = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frankenbeast-remote-address': '10.0.0.9' },
      body: JSON.stringify({ approved: true }),
    });

    expect(approval.status).toBe(429);
    expect((await approval.json()).error.code).toBe('RATE_LIMITED');
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(session.state).toBe('pending_approval');
    expect(session.pendingApproval).toEqual({ description: 'Deploy?', requestedAt: now });
  });

  it('rejects concurrent chat mutations for the same session across valid auth forms', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-concurrent-message',
      projectId: 'proj',
      transcript: [],
      state: 'active',
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
    let resolveRun: ((value: unknown) => void) | undefined;
    const runtime = {
      run: vi.fn(() => new Promise((resolve) => {
        resolveRun = resolve;
      })),
    };

    app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
      operatorToken: 'operator-a',
      chatRateLimit: { windowMs: 60_000, max: 20 },
    });

    const first = app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frankenbeast-operator-token': 'operator-a' },
      body: JSON.stringify({ content: 'first' }),
    });
    await vi.waitFor(() => expect(runtime.run).toHaveBeenCalledTimes(1));

    const second = await app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ content: 'second' }),
    });

    expect(second.status).toBe(429);
    expect((await second.json()).error.code).toBe('RATE_LIMITED');
    expect(runtime.run).toHaveBeenCalledTimes(1);

    resolveRun?.({
      displayMessages: [{ kind: 'reply', content: 'done' }],
      events: [],
      pendingApproval: false,
      state: 'active',
      tier: null,
      transcript: [],
    });
    expect((await first).status).toBe(200);
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

  it('rate limits approval requests before mutating pending approval state', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-rate-limit-approval',
      projectId: 'proj',
      transcript: [],
      state: 'active',
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
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
      chatRateLimit: { windowMs: 60_000, max: 1 },
    });

    const warmup = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ approved: false }),
    });
    expect(warmup.status).toBe(200);

    session.state = 'pending_approval';
    session.pendingApproval = { description: 'Deploy?', requestedAt: now };
    const limited = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer operator-a' },
      body: JSON.stringify({ approved: true }),
    });

    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(runtime.run).not.toHaveBeenCalled();
    expect(session.state).toBe('pending_approval');
    expect(session.pendingApproval).toEqual({ description: 'Deploy?', requestedAt: now });
    expect(sessionStore.save).not.toHaveBeenCalled();
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
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
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

  it('POST /v1/chat/sessions/:id/approve runs the pending command for HTTP fallback approvals', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-http-pending-command',
      projectId: 'proj',
      transcript: [],
      state: 'pending_approval',
      pendingApproval: {
        description: 'Deploy staging',
        requestedAt: now,
        tool: 'execution',
        command: 'deploy staging',
        sessionId: 'chat-http-pending-command',
      },
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
        displayMessages: [{ kind: 'execution' as const, content: 'Done' }],
        events: [{ type: 'complete' as const, sessionId: session.id, data: { status: 'success' } }],
        pendingApproval: false,
        state: 'active',
        tier: 'premium_execution',
        transcript: [],
      })),
    };

    app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
    });

    const res = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('approved');
    expect(body.data.displayMessages).toEqual([{ kind: 'execution', content: 'Done' }]);
    expect(body.data.events).toEqual([{ type: 'complete', sessionId: session.id, data: { status: 'success' } }]);
    expect(runtime.run).toHaveBeenCalledWith('/run deploy staging', expect.objectContaining({
      pendingApproval: true,
      sessionId: session.id,
    }));
    expect(sessionStore.save).toHaveBeenCalledWith(expect.objectContaining({
      state: 'approved',
      pendingApproval: null,
    }));
    expect(session.state).toBe('approved');
    expect(session.pendingApproval).toBeNull();
  });

  it('POST /v1/chat/sessions/:id/approve rejects concurrent HTTP approvals before duplicate execution', async () => {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: 'chat-http-duplicate-approval',
      projectId: 'proj',
      transcript: [],
      state: 'pending_approval',
      pendingApproval: {
        description: 'Deploy staging',
        requestedAt: now,
        tool: 'execution',
        command: 'deploy staging',
        sessionId: 'chat-http-duplicate-approval',
      },
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
    let finishExecution!: () => void;
    let executionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    const runtime = {
      run: vi.fn(async () => {
        executionStarted();
        await finished;
        return {
          displayMessages: [{ kind: 'execution' as const, content: 'Done' }],
          events: [],
          pendingApproval: false,
          state: 'active' as const,
          tier: 'premium_execution',
          transcript: [],
        };
      }),
    };

    app = createChatApp({
      sessionStore,
      engine: {} as never,
      runtime: runtime as never,
      turnRunner: {} as never,
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
    });

    const first = app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    await started;
    const duplicate = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    finishExecution();
    const firstRes = await first;

    expect(firstRes.status).toBe(200);
    expect(duplicate.status).toBe(429);
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect((await duplicate.json()).error.code).toBe('RATE_LIMITED');
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
      sessionTokenSecret: ['test', 'http', 'fixture'].join('-'),
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

  it('enforces request size limits before parsing oversized chat requests', async () => {
    const res = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'p'.repeat(20_000) }),
    });

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      details: { maxSize: 16 * 1024 },
    });
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
      const app = createChatApp({ ...baseChatOpts(), operatorToken: TEST_OPERATOR_TOKEN });
      const res = await app.request('/v1/chat/sessions', { method: 'POST', body: '{}' });
      expect(res.status).toBe(401);
    });

    it('accepts chat requests with a valid bearer operator token', async () => {
      const app = createChatApp({ ...baseChatOpts(), operatorToken: TEST_OPERATOR_TOKEN });
      const res = await app.request('/v1/chat/sessions', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_OPERATOR_TOKEN}`, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).not.toBe(401);
    });

    it('keeps /health public', async () => {
      const app = createChatApp({ ...baseChatOpts(), operatorToken: TEST_OPERATOR_TOKEN });
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });
  });
});
