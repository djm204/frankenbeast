import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('merges a newly adopted external session into existing canonical state', () => {
    const root = tempRoot();
    const legacy = new FileSessionStore(join(root, 'sessions'));
    const registry = new BrainRegistry(join(root, 'brains'));
    const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');
    const firstAt = '2026-07-25T03:00:00.000Z';
    const secondAt = '2026-07-25T03:01:00.000Z';

    try {
      const browser = store.create('project-1');
      browser.transcript.push({
        id: 'browser-message',
        role: 'user',
        content: 'Keep the browser history',
        timestamp: firstAt,
      });
      browser.state = 'pending_approval';
      browser.pendingApproval = {
        description: 'Keep the active approval',
        requestedAt: firstAt,
        risk: 'medium',
      };
      browser.routingMetadata = { browser: true };
      browser.tokenTotals = { cheap: 7, premiumReasoning: 2, premiumExecution: 1 };
      browser.costUsd = 1.25;
      browser.updatedAt = firstAt;
      store.save(browser);

      store.save({
        id: 'comms:discord:channel-1',
        projectId: 'project-1',
        transcript: [
          {
            id: 'browser-message',
            role: 'user',
            content: 'Keep the browser history',
            timestamp: firstAt,
          },
          {
            id: 'discord-message',
            role: 'user',
            content: 'Append this Discord turn',
            timestamp: secondAt,
          },
        ],
        state: 'active',
        pendingApproval: null,
        beastContext: null,
        providerContext: null,
        routingMetadata: { channel: 'discord' },
        tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: 0,
        createdAt: secondAt,
        updatedAt: secondAt,
      });

      const adopted = store.get('comms:discord:channel-1');
      expect(adopted?.transcript.map(message => message.id)).toEqual([
        'browser-message',
        'discord-message',
      ]);
      expect(adopted?.state).toBe('pending_approval');
      expect(adopted?.pendingApproval?.description).toBe('Keep the active approval');
      expect(adopted?.routingMetadata).toEqual({ browser: true, channel: 'discord' });
      expect(adopted?.tokenTotals).toEqual({
        cheap: 7,
        premiumReasoning: 2,
        premiumExecution: 1,
      });
      expect(adopted?.costUsd).toBe(1.25);

      const canonicalTranscript = adopted?.transcript ?? [];
      store.save({
        id: 'comms:discord:complete-overlap',
        projectId: 'project-1',
        transcript: canonicalTranscript,
        state: 'active',
        pendingApproval: null,
        beastContext: null,
        providerContext: null,
        routingMetadata: { channel: 'discord' },
        tokenTotals: { cheap: 7, premiumReasoning: 2, premiumExecution: 1 },
        costUsd: 1.25,
        createdAt: secondAt,
        updatedAt: secondAt,
      });
      expect(store.get('comms:discord:complete-overlap')?.tokenTotals.cheap).toBe(7);
      expect(store.get('comms:discord:complete-overlap')?.costUsd).toBe(1.25);

      expect(() => store.save({
        id: 'comms:discord:ambiguous-overlap',
        projectId: 'project-1',
        transcript: [
          canonicalTranscript[0]!,
          {
            id: 'another-discord-message',
            role: 'user',
            content: 'Usage attribution is ambiguous',
            timestamp: secondAt,
          },
        ],
        state: 'active',
        pendingApproval: null,
        beastContext: null,
        providerContext: null,
        routingMetadata: { channel: 'discord' },
        tokenTotals: { cheap: 3, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: 0.5,
        createdAt: secondAt,
        updatedAt: secondAt,
      })).toThrow('Cannot safely merge aggregate usage for partially overlapping session');
    } finally {
      registry.close();
    }
  });

  it('keeps a newly adopted binding discoverable when its projection fails', () => {
    const root = tempRoot();
    class ProjectionFailsStore extends FileSessionStore {
      private failed = false;

      override save(session: Parameters<FileSessionStore['save']>[0]): void {
        if (
          session.conversationId
          && session.conversationId !== '__pending_brain_conversation_binding__'
          && !this.failed
        ) {
          this.failed = true;
          throw new Error('simulated projection failure');
        }
        super.save(session);
      }
    }
    const legacy = new ProjectionFailsStore(join(root, 'sessions'));
    const registry = new BrainRegistry(join(root, 'brains'));
    const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');
    const now = '2026-07-25T03:00:00.000Z';
    const session = {
      id: 'comms:discord:channel-1',
      projectId: 'project-1',
      transcript: [{
        id: 'message-1',
        role: 'user' as const,
        content: 'Remain discoverable',
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
      expect(() => store.save(session)).not.toThrow();
      expect(store.list()).toContain(session.id);
      expect(store.get(session.id)?.transcript).toEqual(session.transcript);
      expect(registry.forWorkspaceHive('project-1').conversations.isProjectionPending(
        session.id,
      )).toBe(false);
    } finally {
      registry.close();
    }
  });

  it('adds usage when an adopted external transcript is disjoint', () => {
    const root = tempRoot();
    const legacy = new FileSessionStore(join(root, 'sessions'));
    const registry = new BrainRegistry(join(root, 'brains'));
    const brain = registry.forWorkspaceHive('project-1');
    const firstAt = '2026-07-25T00:00:00.000Z';
    const conversation = brain.conversations.resolveOrCreateAndBind(
      'project-1',
      'local-operator',
      'browser-session',
    );
    brain.conversations.saveBound('browser-session', {
      ...conversation,
      transcript: [{ role: 'assistant', content: 'Canonical', timestamp: firstAt }],
      tokenTotals: { cheap: 7, premiumReasoning: 2, premiumExecution: 1 },
      costUsd: 1.25,
    });
    const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');

    try {
      store.save({
        id: 'comms:discord:disjoint',
        projectId: 'project-1',
        transcript: [{
          role: 'user',
          content: 'Independent external turn',
          timestamp: '2026-07-25T00:01:00.000Z',
        }],
        state: 'active',
        tokenTotals: { cheap: 3, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: 0.5,
        createdAt: firstAt,
        updatedAt: '2026-07-25T00:01:00.000Z',
        pendingApproval: null,
        beastContext: null,
      });

      expect(store.get('comms:discord:disjoint')?.tokenTotals).toEqual({
        cheap: 10,
        premiumReasoning: 2,
        premiumExecution: 1,
      });
      expect(store.get('comms:discord:disjoint')?.costUsd).toBe(1.75);
    } finally {
      registry.close();
    }
  });

  it('retries canonical adoption when compensating legacy cleanup fails', () => {
    const root = tempRoot();
    class DeleteFailsOnceStore extends FileSessionStore {
      failNextDelete = true;

      override delete(id: string): void {
        if (this.failNextDelete) {
          this.failNextDelete = false;
          throw new Error('simulated cleanup failure');
        }
        super.delete(id);
      }
    }
    const legacy = new DeleteFailsOnceStore(join(root, 'sessions'));
    const registry = new BrainRegistry(join(root, 'brains'));
    const brain = registry.forWorkspaceHive('project-1');
    const saveBound = vi.spyOn(brain.conversations, 'saveBound');
    saveBound.mockImplementationOnce(() => {
      throw new Error('simulated canonical failure');
    });
    vi.spyOn(brain.conversations, 'unbindSession').mockImplementationOnce(() => {
      throw new Error('simulated unbind failure');
    });
    const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');
    const now = '2026-07-25T03:00:00.000Z';
    const session = {
      id: 'comms:discord:channel-1',
      projectId: 'project-1',
      transcript: [{
        role: 'user' as const,
        content: 'Recover this turn from the pending locator',
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
      expect(() => store.save(session)).toThrow('simulated canonical failure');
      expect(legacy.get(session.id)).toBeDefined();
      const recovered = store.get(session.id);
      expect(recovered?.conversationId).not.toBe(
        '__pending_brain_conversation_binding__',
      );
      expect(recovered?.transcript).toEqual(session.transcript);

      expect(() => store.save(session)).not.toThrow();
      expect(brain.conversations.getConversationIdForSession(session.id)).toBeDefined();
      expect(store.get(session.id)?.conversationId).toBeDefined();
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
      store.save(existing);
      expect(registry.forWorkspaceHive('project-1').conversations.getByScope(
        'project-1',
        'local-operator',
      )).toBeUndefined();
    } finally {
      registry.close();
    }
  });

  it('does not open a Hive when reading a definitely unbound legacy session', () => {
    const root = tempRoot();
    const legacy = new FileSessionStore(join(root, 'sessions'));
    const existing = legacy.create('project-1');
    const registry = new BrainRegistry(join(root, 'brains'));
    const openHive = vi.spyOn(registry, 'getWorkspaceHive').mockImplementation(() => {
      throw new Error('unsupported Hive schema');
    });

    try {
      const store = new BrainConversationSessionStore(legacy, registry, 'local-operator');
      expect(store.get(existing.id)).toEqual(existing);
      expect(store.mutationKey(existing.id)).toBe(existing.id);
      expect(openHive).not.toHaveBeenCalled();
    } finally {
      registry.close();
    }
  });
});
