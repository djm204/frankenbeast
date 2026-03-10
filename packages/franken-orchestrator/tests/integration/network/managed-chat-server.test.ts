import { describe, expect, it, vi } from 'vitest';
import { resolveChatServerSessionStore } from '../../../src/http/chat-server.js';

describe('managed chat server overrides', () => {
  it('uses an injected session store in managed mode while remaining standalone-capable', async () => {
    const sessionStore = {
      list: vi.fn(() => []),
      get: vi.fn(() => undefined),
      save: vi.fn(),
      create: vi.fn((projectId: string) => ({
        id: 'managed-session',
        projectId,
        transcript: [],
        state: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    };

    const resolved = resolveChatServerSessionStore({
      sessionStoreDir: '/tmp/managed-chat',
      sessionStore,
    });

    expect(resolved).toBe(sessionStore);
  });
});
