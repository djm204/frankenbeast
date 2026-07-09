import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createChatApp } from '../../../src/http/chat-app.js';
import { FileSessionStore } from '../../../src/chat/session-store.js';
import type { ChatSession } from '../../../src/chat/types.js';

function pendingApprovalSession(session: ChatSession): ChatSession {
  return {
    ...session,
    state: 'pending_approval',
    pendingApproval: {
      description: 'Deploy the generated fix',
      requestedAt: '2026-07-07T15:23:06.000Z',
    },
  };
}

describe('chat approval route persistence', () => {
  let sessionStoreDir: string;
  let sessionStore: FileSessionStore;

  beforeEach(() => {
    sessionStoreDir = mkdtempSync(join(tmpdir(), 'franken-chat-approval-route-'));
    sessionStore = new FileSessionStore(sessionStoreDir);
  });

  afterEach(() => {
    rmSync(sessionStoreDir, { recursive: true, force: true });
  });

  it('clears pending approval metadata when a session is approved over HTTP', async () => {
    const app = createChatApp({
      sessionStore,
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'chat-approval-route-test',
    });
    const session = pendingApprovalSession(sessionStore.create('project-1'));
    sessionStore.save(session);

    const response = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { approved: boolean; state: string } };
    expect(body.data).toMatchObject({ approved: true, state: 'approved' });
    const stored = sessionStore.get(session.id);
    expect(stored?.state).toBe('approved');
    expect(stored?.pendingApproval).toBeNull();
  });

  it('clears pending approval metadata when a session is rejected over HTTP', async () => {
    const app = createChatApp({
      sessionStore,
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'chat-approval-route-test',
    });
    const session = pendingApprovalSession(sessionStore.create('project-1'));
    sessionStore.save(session);

    const response = await app.request(`/v1/chat/sessions/${session.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: false }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { approved: boolean; state: string } };
    expect(body.data).toMatchObject({ approved: false, state: 'rejected' });
    const stored = sessionStore.get(session.id);
    expect(stored?.state).toBe('rejected');
    expect(stored?.pendingApproval).toBeNull();
  });

  it('preserves pending approval metadata when a stale HTTP message is blocked', async () => {
    const app = createChatApp({
      sessionStore,
      llm: { complete: vi.fn().mockResolvedValue('hello') },
      projectName: 'chat-approval-route-test',
    });
    const session = pendingApprovalSession(sessionStore.create('project-1'));
    session.pendingApproval = {
      ...session.pendingApproval!,
      tool: 'execution',
      command: 'deploy staging',
      risk: 'Requires approval.',
      sessionId: session.id,
    };
    sessionStore.save(session);

    const response = await app.request(`/v1/chat/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'start something else' }),
    });

    expect(response.status).toBe(200);
    const stored = sessionStore.get(session.id);
    expect(stored?.state).toBe('pending_approval');
    expect(stored?.pendingApproval).toEqual(expect.objectContaining({
      description: 'Deploy the generated fix',
      tool: 'execution',
      command: 'deploy staging',
      risk: 'Requires approval.',
      sessionId: session.id,
    }));
  });
});
