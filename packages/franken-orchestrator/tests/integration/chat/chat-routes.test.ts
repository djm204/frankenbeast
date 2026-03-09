import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChatApp } from '../../../src/http/chat-app.js';
import { verifySessionToken } from '../../../src/http/ws-chat-auth.js';

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
