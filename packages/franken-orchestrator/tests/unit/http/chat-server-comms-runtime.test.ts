import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrainRegistry } from '@franken/brain';
import {
  BrainConversationSessionStore,
  FileSessionStore,
} from '../../../src/chat/session-store.js';
import type { ChatSession } from '../../../src/chat/types.js';
import {
  createCommsRuntimeAdapter,
  resolveChatServerSessionStore,
} from '../../../src/http/chat-server.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'franken-chat-server-comms-'));
  roots.push(root);
  return root;
}

function session(id: string, projectId = 'project-1'): ChatSession {
  const now = '2026-07-25T12:00:00.000Z';
  return {
    id,
    projectId,
    transcript: [],
    state: 'active',
    tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
    costUsd: 0,
    createdAt: now,
    updatedAt: now,
    pendingApproval: null,
    beastContext: null,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('chat-server comms canonical storage', () => {
  it('persists transcript token totals and scopes shared channel sessions by principal', async () => {
    const root = tempRoot();
    const store = new FileSessionStore(join(root, 'sessions'));
    const runtime = {
      run: vi.fn(async (_text: string, state: { sessionId: string }) => ({
        displayMessages: [{ kind: 'reply' as const, content: 'answer' }],
        events: [],
        pendingApproval: false,
        state: 'active',
        tier: 'premium_reasoning',
        transcript: [{
          role: 'assistant' as const,
          content: 'answer',
          timestamp: '2026-07-25T12:00:00.000Z',
          modelTier: 'premium_reasoning',
          tokens: 42,
        }],
        providerContext: { provider: 'test', model: state.sessionId },
      })),
    };
    const adapter = createCommsRuntimeAdapter(
      runtime as any,
      store,
      join(root, 'legacy'),
      'project-1',
    );

    await adapter.processInbound({
      sessionId: 'shared-channel',
      channelType: 'discord',
      text: 'first',
      externalUserId: 'user-1',
    });
    await adapter.processInbound({
      sessionId: 'shared-channel',
      channelType: 'discord',
      text: 'second',
      externalUserId: 'user-2',
    });

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.every(entry => entry.id.startsWith('comms:'))).toBe(true);
    expect(sessions.map(entry => entry.tokenTotals)).toEqual([
      { cheap: 0, premiumReasoning: 42, premiumExecution: 0 },
      { cheap: 0, premiumReasoning: 42, premiumExecution: 0 },
    ]);
    expect(new Set(runtime.run.mock.calls.map(([, state]) => state.sessionId)).size).toBe(2);
  });

  it('keeps browser and external principals in separate canonical conversations', () => {
    const root = tempRoot();
    const registry = new BrainRegistry(join(root, 'brains'));
    const store = resolveChatServerSessionStore({
      brainRegistry: registry,
      sessionStoreDir: join(root, 'sessions'),
    }) as BrainConversationSessionStore;

    try {
      store.save(session('browser-session'));
      store.save(session('comms:shared:user-1'));
      store.save(session('comms:shared:user-2'));

      const ids = [
        store.get('browser-session')?.conversationId,
        store.get('comms:shared:user-1')?.conversationId,
        store.get('comms:shared:user-2')?.conversationId,
      ];
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(3);
    } finally {
      registry.close();
    }
  });
});
