import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChatApp } from '../../../src/http/chat-app.js';
import { verifySessionToken } from '../../../src/http/ws-chat-auth.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import { BeastInterviewService } from '../../../src/beasts/services/beast-interview-service.js';
import { BeastDispatchService } from '../../../src/beasts/services/beast-dispatch-service.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { PrometheusBeastMetrics } from '../../../src/beasts/telemetry/prometheus-beast-metrics.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';

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
      container: {
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
      },
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

    const createRes = await app.request('/v1/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj' }),
    });
    const { data: created } = await createRes.json();

    const promptOneRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'spawn a martin beast' }),
    });
    expect(promptOneRes.status).toBe(200);
    const promptOne = await promptOneRes.json();
    expect(promptOne.data.outcome.kind).toBe('reply');
    expect(promptOne.data.outcome.content).toContain('Which provider should run the martin loop?');

    const promptTwoRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'claude' }),
    });
    const promptTwo = await promptTwoRes.json();
    expect(promptTwo.data.outcome.content).toContain('What should the martin loop accomplish?');

    const dispatchRes = await app.request(`/v1/chat/sessions/${created.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Ship Beast monitoring' }),
    });
    const dispatchBody = await dispatchRes.json();
    expect(dispatchBody.data.outcome.kind).toBe('reply');
    expect(dispatchBody.data.outcome.content).toContain('Martin Loop');
    expect(dispatchBody.data.outcome.content).toContain('running');

    const sessionRes = await app.request(`/v1/chat/sessions/${created.id}`);
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
      status: 'running',
    });
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
});
