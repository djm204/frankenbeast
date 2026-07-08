import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatApp } from '../../../src/http/chat-app.js';

const AUTH_HEADER = { authorization: 'Bearer op-secret' };

function createApp(sessionStoreDir: string) {
  return createChatApp({
    sessionStoreDir,
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'chat-sse-ticket-test',
    operatorToken: 'op-secret',
  });
}

async function createSession(app: ReturnType<typeof createChatApp>): Promise<string> {
  const response = await app.request('/v1/chat/sessions', {
    method: 'POST',
    headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'project-1' }),
  });
  expect(response.status).toBe(201);
  const body = await response.json() as { data: { id: string } };
  return body.data.id;
}

describe('chat SSE stream ticket authentication', () => {
  let sessionStoreDir: string;

  beforeEach(() => {
    sessionStoreDir = mkdtempSync(join(tmpdir(), 'franken-chat-sse-ticket-'));
  });

  afterEach(() => {
    rmSync(sessionStoreDir, { recursive: true, force: true });
  });

  it('keeps the ticket minting endpoint behind operator auth', async () => {
    const app = createApp(sessionStoreDir);
    const sessionId = await createSession(app);

    const response = await app.request(`/v1/chat/sessions/${sessionId}/stream/ticket`, {
      method: 'POST',
    });

    expect(response.status).toBe(401);
  });

  it('rejects direct stream access without a short-lived ticket', async () => {
    const app = createApp(sessionStoreDir);
    const sessionId = await createSession(app);

    const response = await app.request(`/v1/chat/sessions/${sessionId}/stream`);

    expect(response.status).toBe(401);
    await response.body?.cancel();
  });

  it('returns the same auth failure for missing sessions before session lookup', async () => {
    const app = createApp(sessionStoreDir);

    const response = await app.request('/v1/chat/sessions/not-a-real-session/stream?ticket=bogus');

    expect(response.status).toBe(401);
  });

  it('preserves bearer authentication for non-browser stream callers', async () => {
    const app = createApp(sessionStoreDir);
    const sessionId = await createSession(app);

    const response = await app.request(`/v1/chat/sessions/${sessionId}/stream`, {
      headers: AUTH_HEADER,
    });

    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it('accepts a one-shot query ticket for browser EventSource streams without bearer headers', async () => {
    const app = createApp(sessionStoreDir);
    const sessionId = await createSession(app);

    const ticketResponse = await app.request(`/v1/chat/sessions/${sessionId}/stream/ticket`, {
      method: 'POST',
      headers: AUTH_HEADER,
    });
    expect(ticketResponse.status).toBe(200);
    const { ticket } = await ticketResponse.json() as { ticket: string };
    expect(ticket).toEqual(expect.any(String));

    const streamResponse = await app.request(`/v1/chat/sessions/${sessionId}/stream?${new URLSearchParams({ ticket })}`);
    expect(streamResponse.status).toBe(200);
    await streamResponse.body?.cancel();

    const reuseResponse = await app.request(`/v1/chat/sessions/${sessionId}/stream?${new URLSearchParams({ ticket })}`);
    expect(reuseResponse.status).toBe(401);
  });

  it('scopes one-shot stream tickets to the session that minted them', async () => {
    const app = createApp(sessionStoreDir);
    const firstSessionId = await createSession(app);
    const secondSessionId = await createSession(app);

    const ticketResponse = await app.request(`/v1/chat/sessions/${firstSessionId}/stream/ticket`, {
      method: 'POST',
      headers: AUTH_HEADER,
    });
    expect(ticketResponse.status).toBe(200);
    const { ticket } = await ticketResponse.json() as { ticket: string };

    const wrongSessionResponse = await app.request(
      `/v1/chat/sessions/${secondSessionId}/stream?${new URLSearchParams({ ticket })}`,
    );
    expect(wrongSessionResponse.status).toBe(401);

    const consumedResponse = await app.request(
      `/v1/chat/sessions/${firstSessionId}/stream?${new URLSearchParams({ ticket })}`,
    );
    expect(consumedResponse.status).toBe(401);
  });
});
