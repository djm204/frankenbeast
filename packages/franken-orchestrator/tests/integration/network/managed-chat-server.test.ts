import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BrainRegistry } from '@franken/brain';
import { describe, expect, it, vi } from 'vitest';
import { BrainConversationSessionStore } from '../../../src/chat/session-store.js';
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

  it('binds standalone chat sessions to the process workspace Hive brain', () => {
    const root = mkdtempSync(join(tmpdir(), 'managed-chat-brain-'));
    const registry = new BrainRegistry(join(root, 'brains'));

    try {
      const resolved = resolveChatServerSessionStore({
        sessionStoreDir: join(root, 'chat'),
        brainRegistry: registry,
      });
      const first = resolved.create('workspace-1');
      const second = resolved.create('workspace-1');

      expect(resolved).toBeInstanceOf(BrainConversationSessionStore);
      expect(resolved.mutationKey?.(first.id)).toBe(resolved.mutationKey?.(second.id));
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires an owned registry when constructing the default store directly', () => {
    expect(() => resolveChatServerSessionStore({
      sessionStoreDir: '/tmp/unused-chat-store',
    })).toThrow('brainRegistry is required when sessionStore is not provided');
  });
});
