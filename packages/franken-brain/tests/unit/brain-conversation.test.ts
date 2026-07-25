import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CorruptBrainConversationError,
  CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
  BrainRegistry,
  SqliteBrain,
  UnsupportedBrainConversationSchemaVersionError,
} from '../../src/index.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'franken-brain-conversation-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('BrainConversation persistence', () => {
  it('creates one canonical conversation per workspace and subject', () => {
    const registry = new BrainRegistry();
    try {
      const brain = registry.forWorkspaceHive('workspace-1', ':memory:');
      const created = brain.conversations.resolveOrCreate('workspace-1', 'local-operator');
      const resolved = brain.conversations.resolveOrCreate('workspace-1', 'local-operator');

      expect(resolved).toEqual(created);
      expect(created).toMatchObject({
        schemaVersion: CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
        workspaceId: 'workspace-1',
        subjectId: 'local-operator',
        brainKey: 'workspace-hive:workspace-1',
        facultyId: null,
        transcript: [],
        state: 'active',
        pendingApproval: null,
        beastContext: null,
        supervisedAgents: [],
        crossAgentSummary: null,
        providerContext: null,
        routingMetadata: {},
        tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: 0,
      });
      expect(created.id).toMatch(/^brain-conversation-/);
    } finally {
      registry.close();
    }
  });

  it('persists repeated interactions and supervised-agent state across registry lifetimes', () => {
    const brainsDir = join(tempRoot(), '.fbeast', 'brains');
    const firstRegistry = new BrainRegistry(brainsDir);
    const firstBrain = firstRegistry.forWorkspaceHive('workspace-1');
    const conversation = firstBrain.conversations.resolveOrCreate('workspace-1', 'operator-1');

    firstBrain.conversations.save({
      ...conversation,
      transcript: [
        { id: 'message-1', role: 'user', content: 'What are my agents doing?', timestamp: '2026-07-25T00:00:00.000Z' },
        { id: 'message-2', role: 'assistant', content: 'One agent is testing.', timestamp: '2026-07-25T00:00:01.000Z' },
      ],
      supervisedAgents: [
        {
          agentId: 'agent-1',
          agentTypeId: 'coder',
          runId: 'run-1',
          status: 'running',
          lastObservedAt: '2026-07-25T00:00:01.000Z',
        },
      ],
      crossAgentSummary: 'Coder is testing the workspace.',
      updatedAt: '2026-07-25T00:00:01.000Z',
    });
    firstRegistry.close();

    const secondRegistry = new BrainRegistry(brainsDir);
    try {
      const reloaded = secondRegistry
        .forWorkspaceHive('workspace-1')
        .conversations.getByScope('workspace-1', 'operator-1');

      expect(reloaded?.id).toBe(conversation.id);
      expect(reloaded?.transcript).toHaveLength(2);
      expect(reloaded?.supervisedAgents).toEqual([
        expect.objectContaining({ agentId: 'agent-1', status: 'running' }),
      ]);
      expect(reloaded?.crossAgentSummary).toBe('Coder is testing the workspace.');
    } finally {
      secondRegistry.close();
    }
  });

  it('isolates conversations by workspace and subject', () => {
    const registry = new BrainRegistry();
    try {
      const first = registry
        .forWorkspaceHive('workspace-1', ':memory:')
        .conversations.resolveOrCreate('workspace-1', 'operator-1');
      const secondSubject = registry
        .forWorkspaceHive('workspace-1', ':memory:')
        .conversations.resolveOrCreate('workspace-1', 'operator-2');
      const secondWorkspace = registry
        .forWorkspaceHive('workspace-2', ':memory:')
        .conversations.resolveOrCreate('workspace-2', 'operator-1');

      expect(new Set([first.id, secondSubject.id, secondWorkspace.id]).size).toBe(3);
      expect(secondWorkspace.brainKey).toBe('workspace-hive:workspace-2');
    } finally {
      registry.close();
    }
  });

  it('fails closed on a corrupt canonical record instead of replacing it', () => {
    const dbPath = join(tempRoot(), 'workspace.db');
    const writer = new SqliteBrain(dbPath);
    const conversation = writer.conversations.resolveOrCreate('workspace-1', 'operator-1');
    writer.close();

    const raw = new Database(dbPath);
    raw.prepare(`UPDATE brain_conversations SET payload = ? WHERE id = ?`).run('{not-json', conversation.id);
    raw.close();

    const reader = new SqliteBrain(dbPath);
    try {
      expect(() => reader.conversations.resolveOrCreate('workspace-1', 'operator-1')).toThrow(
        CorruptBrainConversationError,
      );
    } finally {
      reader.close();
    }
  });

  it('rolls back aggregate changes when bound-session metadata cannot commit', () => {
    const dbPath = join(tempRoot(), 'workspace.db');
    const brain = new SqliteBrain(dbPath);
    try {
      const conversation = brain.conversations.resolveOrCreate('workspace-1', 'operator-1');
      brain.conversations.bindSession('chat-1', conversation.id);
      const raw = new Database(dbPath);
      raw.exec(`
        CREATE TRIGGER reject_binding_update
        BEFORE UPDATE ON brain_conversation_bindings
        BEGIN
          SELECT RAISE(ABORT, 'binding update rejected');
        END;
      `);
      raw.close();

      expect(() => brain.conversations.saveBound('chat-1', {
        ...conversation,
        transcript: [{
          id: 'message-1',
          role: 'user',
          content: 'must roll back',
          timestamp: '2026-07-25T00:00:00.000Z',
        }],
        updatedAt: '2026-07-25T00:00:00.000Z',
      })).toThrow('binding update rejected');
      expect(brain.conversations.get(conversation.id)?.transcript).toEqual([]);
    } finally {
      brain.close();
    }
  });

  it('journals every bound legacy projection after a direct canonical save', () => {
    const brain = new SqliteBrain(':memory:');
    try {
      const conversation = brain.conversations.resolveOrCreate('workspace-1', 'operator');
      brain.conversations.bindSession('session-1', conversation.id);
      brain.conversations.markProjectionComplete('session-1');

      brain.conversations.save({
        ...conversation,
        state: 'paused',
        updatedAt: '2026-07-25T03:00:00.000Z',
      });

      expect(brain.conversations.isProjectionPending('session-1')).toBe(true);
    } finally {
      brain.close();
    }
  });

  it('atomically creates a conversation and its first session binding', () => {
    const dbPath = join(tempRoot(), 'workspace.db');
    const brain = new SqliteBrain(dbPath, undefined, {
      conversationWorkspaceId: 'workspace-1',
    });
    try {
      const raw = new Database(dbPath);
      raw.exec(`
        CREATE TRIGGER reject_binding_insert
        BEFORE INSERT ON brain_conversation_bindings
        BEGIN
          SELECT RAISE(ABORT, 'binding insert rejected');
        END;
      `);
      raw.close();

      expect(() => brain.conversations.resolveOrCreateAndBind(
        'workspace-1',
        'operator-1',
        'chat-1',
      )).toThrow('binding insert rejected');
      expect(brain.conversations.getByScope('workspace-1', 'operator-1')).toBeUndefined();
    } finally {
      brain.close();
    }
  });

  it('rejects unsupported future conversation schemas', () => {
    const dbPath = join(tempRoot(), 'workspace.db');
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE brain_conversation_schema_versions (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        migrated_at TEXT NOT NULL
      );
      INSERT INTO brain_conversation_schema_versions (store, version, migrated_at)
      VALUES (
        'brain_conversations',
        ${CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION + 1},
        '2026-07-25T00:00:00.000Z'
      );
    `);
    raw.close();

    expect(() => new SqliteBrain(dbPath)).toThrow(
      UnsupportedBrainConversationSchemaVersionError,
    );

    const unchanged = new Database(dbPath, { readonly: true });
    expect(unchanged.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC
    `).pluck().all()).not.toContain('brain_conversations');
    unchanged.close();
  });
});
