import { randomUUID } from 'node:crypto';

import {
  BrainConversationSchema,
  CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
  isoNow,
  type BrainConversation,
} from '@franken/types';
import type Database from 'better-sqlite3';

interface BrainConversationRow {
  id: string;
  workspace_id: string;
  subject_id: string;
  brain_key: string;
  payload: string;
  schema_version: number;
}

export class CorruptBrainConversationError extends Error {
  constructor(readonly conversationId: string, message: string) {
    super(`BrainConversation ${conversationId} is corrupt: ${message}`);
    this.name = 'CorruptBrainConversationError';
  }
}

export class UnsupportedBrainConversationSchemaVersionError extends Error {
  constructor(readonly version: number) {
    super(`Unsupported BrainConversation schema version ${version}`);
    this.name = 'UnsupportedBrainConversationSchemaVersionError';
  }
}

export interface BrainConversationRepository {
  resolveOrCreate(workspaceId: string, subjectId: string): BrainConversation;
  resolveOrCreateAndBind(
    workspaceId: string,
    subjectId: string,
    sessionId: string,
  ): BrainConversation;
  get(id: string): BrainConversation | undefined;
  getByScope(workspaceId: string, subjectId: string): BrainConversation | undefined;
  getConversationIdForSession(sessionId: string): string | undefined;
  isProjectionPending(sessionId: string): boolean;
  bindSession(sessionId: string, conversationId: string): void;
  markProjectionComplete(sessionId: string): void;
  unbindSession(sessionId: string): void;
  save(conversation: BrainConversation): void;
  saveBound(sessionId: string, conversation: BrainConversation): void;
}

export class SqliteBrainConversationRepository implements BrainConversationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly expectedWorkspaceId?: string,
  ) {
    this.assertCompatibleExistingSchemaVersion();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS brain_conversation_schema_versions (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        migrated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brain_conversations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        brain_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, subject_id)
      );
      CREATE TABLE IF NOT EXISTS brain_conversation_bindings (
        session_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES brain_conversations(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        projection_pending INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brain_conversations_updated_at
        ON brain_conversations(updated_at DESC);
    `);
    this.ensureBindingProjectionColumn();
    this.assertSchemaVersion();
  }

  resolveOrCreate(workspaceId: string, subjectId: string): BrainConversation {
    this.assertWorkspaceScope(workspaceId);
    assertIdentifier('subjectId', subjectId);

    const resolve = this.db.transaction(() => this.resolveOrCreateInsideTransaction(
      workspaceId,
      subjectId,
    ));

    return resolve.immediate();
  }

  resolveOrCreateAndBind(
    workspaceId: string,
    subjectId: string,
    sessionId: string,
  ): BrainConversation {
    this.assertWorkspaceScope(workspaceId);
    assertIdentifier('subjectId', subjectId);
    assertIdentifier('sessionId', sessionId);
    const resolveAndBind = this.db.transaction(() => {
      const conversation = this.resolveOrCreateInsideTransaction(workspaceId, subjectId);
      this.bindSessionInsideTransaction(sessionId, conversation.id);
      return conversation;
    });
    return resolveAndBind.immediate();
  }

  get(id: string): BrainConversation | undefined {
    const row = this.db.prepare(`
      SELECT id, workspace_id, subject_id, brain_key, payload, schema_version
      FROM brain_conversations
      WHERE id = ?
    `).get(id) as BrainConversationRow | undefined;
    return row ? this.decode(row) : undefined;
  }

  getByScope(workspaceId: string, subjectId: string): BrainConversation | undefined {
    this.assertWorkspaceScope(workspaceId);
    assertIdentifier('subjectId', subjectId);
    const row = this.selectByScope(workspaceId, subjectId);
    return row ? this.decode(row) : undefined;
  }

  getConversationIdForSession(sessionId: string): string | undefined {
    return this.db.prepare(`
      SELECT conversation_id
      FROM brain_conversation_bindings
      WHERE session_id = ?
    `).pluck().get(sessionId) as string | undefined;
  }

  isProjectionPending(sessionId: string): boolean {
    const value = this.db.prepare(`
      SELECT projection_pending
      FROM brain_conversation_bindings
      WHERE session_id = ?
    `).pluck().get(sessionId) as number | undefined;
    return value === 1;
  }

  bindSession(sessionId: string, conversationId: string): void {
    assertIdentifier('sessionId', sessionId);
    const bind = this.db.transaction(() => this.bindSessionInsideTransaction(sessionId, conversationId));
    bind.immediate();
  }

  markProjectionComplete(sessionId: string): void {
    assertIdentifier('sessionId', sessionId);
    this.db.prepare(`
      UPDATE brain_conversation_bindings
      SET projection_pending = 0, updated_at = ?
      WHERE session_id = ?
    `).run(isoNow(), sessionId);
  }

  unbindSession(sessionId: string): void {
    assertIdentifier('sessionId', sessionId);
    this.db.prepare(`
      DELETE FROM brain_conversation_bindings WHERE session_id = ?
    `).run(sessionId);
  }

  save(input: BrainConversation): void {
    const conversation = BrainConversationSchema.parse(input);
    this.assertWorkspaceScope(conversation.workspaceId);
    const persist = this.db.transaction(() => {
      this.saveInsideTransaction(conversation);
      this.markBoundProjectionsPending(conversation);
    });
    persist.immediate();
  }

  saveBound(sessionId: string, input: BrainConversation): void {
    const conversation = BrainConversationSchema.parse(input);
    this.assertWorkspaceScope(conversation.workspaceId);
    const persist = this.db.transaction(() => {
      const boundConversationId = this.getConversationIdForSession(sessionId);
      if (boundConversationId !== conversation.id) {
        throw new Error(`Chat session ${sessionId} is not bound to BrainConversation ${conversation.id}`);
      }
      this.saveInsideTransaction(conversation);
      this.markBoundProjectionsPending(conversation);
    });
    persist.immediate();
  }

  private insert(conversation: BrainConversation): void {
    this.db.prepare(`
      INSERT INTO brain_conversations (
        id, workspace_id, subject_id, brain_key, payload, schema_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversation.id,
      conversation.workspaceId,
      conversation.subjectId,
      conversation.brainKey,
      JSON.stringify(conversation),
      CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
      conversation.createdAt,
      conversation.updatedAt,
    );
  }

  private resolveOrCreateInsideTransaction(
    workspaceId: string,
    subjectId: string,
  ): BrainConversation {
    const existing = this.selectByScope(workspaceId, subjectId);
    if (existing) return this.decode(existing);

    const timestamp = isoNow();
    const conversation = BrainConversationSchema.parse({
      schemaVersion: CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
      id: `brain-conversation-${randomUUID()}`,
      workspaceId,
      subjectId,
      brainKey: `workspace-hive:${workspaceId}`,
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
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    this.insert(conversation);
    return conversation;
  }

  private bindSessionInsideTransaction(sessionId: string, conversationId: string): void {
    const conversationExists = this.db.prepare(`
      SELECT 1 FROM brain_conversations WHERE id = ?
    `).get(conversationId);
    if (!conversationExists) {
      throw new Error(`Cannot bind unknown BrainConversation ${conversationId}`);
    }
    const existing = this.getConversationIdForSession(sessionId);
    if (existing && existing !== conversationId) {
      throw new Error(`Chat session ${sessionId} is already bound to another BrainConversation`);
    }
    if (existing) return;
    const timestamp = isoNow();
    this.db.prepare(`
      INSERT INTO brain_conversation_bindings (
        session_id, conversation_id, schema_version, projection_pending, created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, ?)
    `).run(
      sessionId,
      conversationId,
      CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
      timestamp,
      timestamp,
    );
  }

  private markBoundProjectionsPending(conversation: BrainConversation): void {
    this.db.prepare(`
      UPDATE brain_conversation_bindings
      SET projection_pending = 1, updated_at = ?
      WHERE conversation_id = ?
    `).run(conversation.updatedAt, conversation.id);
  }

  private saveInsideTransaction(conversation: BrainConversation): void {
    const existing = this.db.prepare(`
      SELECT workspace_id, subject_id
      FROM brain_conversations
      WHERE id = ?
    `).get(conversation.id) as Pick<BrainConversationRow, 'workspace_id' | 'subject_id'> | undefined;
    if (!existing) {
      throw new Error(`Cannot save unknown BrainConversation ${conversation.id}`);
    }
    if (
      existing.workspace_id !== conversation.workspaceId
      || existing.subject_id !== conversation.subjectId
    ) {
      throw new Error('BrainConversation workspaceId and subjectId are immutable');
    }

    this.db.prepare(`
      UPDATE brain_conversations
      SET brain_key = ?, payload = ?, schema_version = ?, updated_at = ?
      WHERE id = ?
    `).run(
      conversation.brainKey,
      JSON.stringify(conversation),
      CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION,
      conversation.updatedAt,
      conversation.id,
    );
  }

  private selectByScope(workspaceId: string, subjectId: string): BrainConversationRow | undefined {
    return this.db.prepare(`
      SELECT id, workspace_id, subject_id, brain_key, payload, schema_version
      FROM brain_conversations
      WHERE workspace_id = ? AND subject_id = ?
    `).get(workspaceId, subjectId) as BrainConversationRow | undefined;
  }

  private decode(row: BrainConversationRow): BrainConversation {
    if (row.schema_version !== CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION) {
      throw new UnsupportedBrainConversationSchemaVersionError(row.schema_version);
    }

    try {
      const parsed = BrainConversationSchema.parse(JSON.parse(row.payload));
      this.assertWorkspaceScope(parsed.workspaceId);
      if (
        parsed.id !== row.id
        || parsed.workspaceId !== row.workspace_id
        || parsed.subjectId !== row.subject_id
        || parsed.brainKey !== row.brain_key
      ) {
        throw new Error('record envelope does not match its canonical payload');
      }
      return parsed;
    } catch (error) {
      throw new CorruptBrainConversationError(
        row.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private ensureBindingProjectionColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(brain_conversation_bindings)').all() as Array<{
      name: string;
    }>;
    if (!columns.some(column => column.name === 'projection_pending')) {
      this.db.exec(`
        ALTER TABLE brain_conversation_bindings
        ADD COLUMN projection_pending INTEGER NOT NULL DEFAULT 0
      `);
    }
  }

  private assertCompatibleExistingSchemaVersion(): void {
    const hasVersionTable = this.db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = 'brain_conversation_schema_versions'
    `).get();
    if (!hasVersionTable) return;

    const row = this.db.prepare(`
      SELECT version
      FROM brain_conversation_schema_versions
      WHERE store = 'brain_conversations'
    `).get() as { version: number } | undefined;
    if (row && row.version !== CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION) {
      throw new UnsupportedBrainConversationSchemaVersionError(row.version);
    }
  }

  private assertSchemaVersion(): void {
    const row = this.db.prepare(`
      SELECT version
      FROM brain_conversation_schema_versions
      WHERE store = 'brain_conversations'
    `).get() as { version: number } | undefined;
    if (row && row.version !== CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION) {
      throw new UnsupportedBrainConversationSchemaVersionError(row.version);
    }
    if (!row) {
      this.db.prepare(`
        INSERT INTO brain_conversation_schema_versions (store, version, migrated_at)
        VALUES ('brain_conversations', ?, ?)
      `).run(CURRENT_BRAIN_CONVERSATION_SCHEMA_VERSION, isoNow());
    }
  }

  private assertWorkspaceScope(workspaceId: string): void {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      throw new RangeError('workspaceId must be a non-empty identifier');
    }
    if (this.expectedWorkspaceId !== undefined && workspaceId !== this.expectedWorkspaceId) {
      throw new Error(
        `${workspaceId} does not match this Hive brain workspace ${this.expectedWorkspaceId}`,
      );
    }
  }
}

function assertIdentifier(
  name: 'subjectId' | 'sessionId',
  value: string,
): void {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.includes('\0')) {
    throw new RangeError(`${name} must be a non-empty trimmed identifier without NUL characters`);
  }
}
