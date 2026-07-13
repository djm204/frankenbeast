import { describe, expect, it, vi } from 'vitest';
import { createChatApp } from '../../../src/http/chat-app.js';
import type { ISessionStore } from '../../../src/chat/session-store.js';
import type { ChatSession } from '../../../src/chat/types.js';

function mockSessionStore(): ISessionStore {
  return {
    create: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    list: vi.fn(() => []),
    listSessions: vi.fn(() => []),
    listCorruptions: vi.fn(() => []),
    delete: vi.fn(),
  };
}

function createApp(sessionStore: ISessionStore) {
  return createChatApp({
    sessionStore,
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'session-id-validation-test',
  });
}

const INVALID_SESSION_ID_CASES: Array<[path: string, method: string, body: Record<string, unknown> | undefined]> = [
  ['/v1/chat/sessions/..%2Fconfig', 'GET', undefined],
  ['/v1/chat/sessions/..%2Fconfig/socket-ticket', 'POST', undefined],
  ['/v1/chat/sessions/..%2Fconfig/messages', 'POST', { content: 'hello' }],
  ['/v1/chat/sessions/..%2Fconfig/stream/ticket', 'POST', undefined],
  ['/v1/chat/sessions/..%2Fconfig/approve', 'POST', { approved: true }],
  ['/v1/chat/sessions/..%2Fconfig/stream', 'GET', undefined],
];

describe('chat route session id validation', () => {
  it.each(INVALID_SESSION_ID_CASES)('rejects invalid id before session-store access for %s', async (path: string, method: string, body: Record<string, unknown> | undefined) => {
    const sessionStore = mockSessionStore();
    const app = createApp(sessionStore);

    const response = await app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_SESSION_ID' },
    });
    expect(sessionStore.get).not.toHaveBeenCalled();
  });

  it('continues to load valid chat session ids', async () => {
    const session: ChatSession = {
      id: 'chat-1234-abcd',
      projectId: 'project-1',
      transcript: [],
      state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:01.000Z',
    };
    const sessionStore = mockSessionStore();
    vi.mocked(sessionStore.get).mockReturnValue(session);
    const app = createApp(sessionStore);

    const response = await app.request(`/v1/chat/sessions/${session.id}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: session.id } });
    expect(sessionStore.get).toHaveBeenCalledWith(session.id);
  });
});
