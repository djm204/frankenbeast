import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BrainRegistry } from '@franken/brain';
import {
  BrainConversationSessionStore,
  FileSessionStore,
} from '../../../src/chat/session-store.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'franken-brain-session-store-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('BrainConversationSessionStore', () => {
  it('journals and repairs a failed legacy projection after the canonical commit', () => {
    const root = tempRoot();
    const registry = new BrainRegistry(join(root, 'brains'));
    class FlakySessionStore extends FileSessionStore {
      failNextSave = false;

      override save(session: Parameters<FileSessionStore['save']>[0]): void {
        if (this.failNextSave) {
          this.failNextSave = false;
          throw new Error('simulated projection failure');
        }
        super.save(session);
      }
    }
    const legacy = new FlakySessionStore(join(root, 'sessions'));
    const store = new BrainConversationSessionStore(legacy, registry, 'operator-1');

    try {
      const session = store.create('workspace-1');
      session.transcript.push({
        id: 'message-1',
        role: 'user',
        content: 'durable despite projection failure',
        timestamp: '2026-07-25T00:00:00.000Z',
      });
      legacy.failNextSave = true;

      expect(() => store.save(session)).not.toThrow();
      const brain = registry.getWorkspaceHive('workspace-1');
      expect(brain?.conversations.isProjectionPending(session.id)).toBe(true);

      expect(store.get(session.id)?.transcript).toEqual(session.transcript);
      expect(brain?.conversations.isProjectionPending(session.id)).toBe(false);
      expect(legacy.get(session.id)?.transcript).toEqual(session.transcript);
    } finally {
      registry.close();
    }
  });

  it('binds new sessions to one canonical workspace conversation', () => {
    const root = tempRoot();
    const registry = new BrainRegistry(join(root, 'brains'));
    const store = new BrainConversationSessionStore(
      new FileSessionStore(join(root, 'sessions')),
      registry,
      'local-operator',
    );

    try {
      const first = store.create('project-1');
      first.transcript.push({
        id: 'message-1',
        role: 'user',
        content: 'Remember this interaction',
        timestamp: '2026-07-25T00:00:00.000Z',
      });
      store.save(first);

      const second = store.create('project-1');
      expect(second.id).not.toBe(first.id);
      expect(second.transcript).toEqual(first.transcript);

      second.transcript.push({
        id: 'message-2',
        role: 'assistant',
        content: 'It persists across browser sessions',
        timestamp: '2026-07-25T00:00:01.000Z',
      });
      store.save(second);

      const brain = registry.forWorkspaceHive('project-1');
      expect(brain.conversations.isProjectionPending(first.id)).toBe(true);
      expect(store.get(first.id)?.transcript).toHaveLength(2);
      expect(brain.conversations.isProjectionPending(first.id)).toBe(false);
      expect(new FileSessionStore(join(root, 'sessions')).get(first.id)?.transcript).toHaveLength(2);
      expect(brain.conversations.getConversationIdForSession(second.id)).toBeDefined();
      store.delete(second.id);
      expect(brain.conversations.getConversationIdForSession(second.id)).toBeUndefined();
    } finally {
      registry.close();
    }
  });

  it('adopts externally assigned session ids into canonical persistence on first save', () => {
    const root = tempRoot();
    const legacy = new FileSessionStore(join(root, 'sessions'));
    const registry = new BrainRegistry(join(root, 'brains'));
    const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');
    const now = '2026-07-25T03:00:00.000Z';
    const session = {
      id: 'comms:discord:channel-1',
      projectId: 'project-1',
      transcript: [{
        id: 'message-1',
        role: 'user' as const,
        content: 'Persist this comms turn',
        timestamp: now,
      }],
      state: 'active' as const,
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
      pendingApproval: null,
      beastContext: null,
    };

    try {
      store.save(session);

      const conversation = registry
        .forWorkspaceHive('project-1')
        .conversations.getByScope('project-1', 'local-operator');
      expect(conversation?.transcript).toEqual(session.transcript);
      expect(store.get(session.id)).toMatchObject({ conversationId: conversation?.id });
    } finally {
      registry.close();
    }
  });

  it('keeps pre-existing unbound session records backward compatible', () => {
    const root = tempRoot();
    const sessionsDir = join(root, 'sessions');
    const legacy = new FileSessionStore(sessionsDir);
    const existing = legacy.create('project-1');
    existing.transcript.push({
      role: 'user',
      content: 'Legacy transcript stays with this session',
      timestamp: '2026-07-25T00:00:00.000Z',
    });
    legacy.save(existing);

    const registry = new BrainRegistry(join(root, 'brains'));
    try {
      const store = new BrainConversationSessionStore(
        new FileSessionStore(sessionsDir),
        registry,
        'local-operator',
      );

      expect(store.get(existing.id)).toEqual(existing);
      expect(registry.forWorkspaceHive('project-1').conversations.getByScope(
        'project-1',
        'local-operator',
      )).toBeUndefined();
    } finally {
      registry.close();
    }
  });
});
