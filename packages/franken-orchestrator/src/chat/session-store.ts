import { readFileSync, readdirSync, unlinkSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { ChatSessionSchema, type ChatSession } from './types.js';
import { isoNow, now as deterministicNow } from '@franken/types';
import type { BrainConversation, BrainRegistry } from '@franken/brain';
import { atomicWriteFileSync } from '../session/atomic-file.js';

const MAX_CHAT_SESSION_ID_LENGTH = 128;

export function isValidChatSessionId(id: string): boolean {
  return id.length > 0
    && id.length <= MAX_CHAT_SESSION_ID_LENGTH
    && id !== '.'
    && id !== '..'
    && !id.includes('/')
    && !id.includes('\\')
    && !id.includes('\0');
}

export interface CorruptChatSessionFile {
  id: string;
  projectId?: string;
  path: string;
  quarantinePath: string;
  reason: string;
}

export interface ISessionStore {
  create(projectId: string): ChatSession;
  get(id: string): ChatSession | undefined;
  save(session: ChatSession): void;
  list(): string[];
  listSessions(projectId?: string): ChatSession[];
  mutationKey?(sessionId: string): string;
  listCorruptions?(projectId?: string): CorruptChatSessionFile[];
  delete(id: string): void;
}

function formatCorruptSessionReason(error: unknown): string {
  if (error instanceof Error && error.name === 'ZodError') {
    const issues = (error as { issues?: Array<{ code?: string; received?: string; message?: string }> }).issues;
    if (Array.isArray(issues) && issues.some((issue) => (
      issue.code === 'invalid_type'
      && (issue.received === 'undefined' || issue.message?.includes('received undefined'))
    ))) {
      return 'Required';
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export class FileSessionStore implements ISessionStore {
  private readonly storeDir: string;
  private readonly corruptions = new Map<string, CorruptChatSessionFile>();

  constructor(storeDir: string) {
    this.storeDir = storeDir;
  }

  create(projectId: string): ChatSession {
    const id = `chat-${deterministicNow()}-${randomBytes(2).toString('hex')}`;
    const now = isoNow();
    const session: ChatSession = {
      id,
      projectId,
      transcript: [],
      state: 'active',
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.writeToDisk(session);
    return session;
  }

  get(id: string): ChatSession | undefined {
    const path = this.safeFilePath(id);
    if (path === undefined) {
      return undefined;
    }

    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch {
      return undefined;
    }

    try {
      return ChatSessionSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.quarantineCorruptSession(id, path, raw, error);
      return undefined;
    }
  }

  save(session: ChatSession): void {
    this.writeToDisk(session);
  }

  list(): string[] {
    try {
      return readdirSync(this.storeDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  listSessions(projectId?: string): ChatSession[] {
    return this.list()
      .map((id) => this.get(id))
      .filter((session): session is ChatSession => session !== undefined)
      .filter((session) => projectId === undefined || session.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  listCorruptions(projectId?: string): CorruptChatSessionFile[] {
    for (const diagnostic of this.listQuarantinedFiles()) {
      if (this.hasValidCurrentSessionFile(diagnostic.id)) {
        this.corruptions.delete(diagnostic.id);
        continue;
      }
      if (!this.corruptions.has(diagnostic.id)) {
        this.corruptions.set(diagnostic.id, diagnostic);
      }
    }
    return Array.from(this.corruptions.values())
      .filter((diagnostic) => projectId === undefined || diagnostic.projectId === undefined || diagnostic.projectId === projectId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  delete(id: string): void {
    const path = this.safeFilePath(id);
    if (path === undefined) {
      return;
    }

    try {
      unlinkSync(path);
    } catch {
      // swallow ENOENT
    }
  }

  private filePath(id: string): string {
    return join(this.storeDir, `${id}.json`);
  }

  private safeFilePath(id: string): string | undefined {
    if (!isValidChatSessionId(id)) {
      console.warn(`[chat-session-store] ignoring invalid chat session id ${JSON.stringify(id)}`);
      return undefined;
    }

    const resolvedStoreDir = resolve(this.storeDir);
    const resolvedPath = resolve(this.storeDir, `${id}.json`);
    if (resolvedPath === resolvedStoreDir || !resolvedPath.startsWith(`${resolvedStoreDir}${sep}`)) {
      console.warn(`[chat-session-store] ignoring invalid chat session id ${JSON.stringify(id)}`);
      return undefined;
    }
    return resolvedPath;
  }

  private writeToDisk(session: ChatSession): void {
    mkdirSync(this.storeDir, { recursive: true });
    const destination = this.safeFilePath(session.id);
    if (destination === undefined) {
      throw new Error(`Invalid chat session id: ${JSON.stringify(session.id)}`);
    }
    const existingMode = this.existingFileMode(destination);
    atomicWriteFileSync(destination, JSON.stringify(session, null, 2), {
      mode: existingMode ?? 0o600,
    });
    this.corruptions.delete(session.id);
  }

  private existingFileMode(path: string): number | undefined {
    try {
      return statSync(path).mode & 0o777;
    } catch {
      return undefined;
    }
  }

  private hasValidCurrentSessionFile(id: string): boolean {
    const path = this.safeFilePath(id);
    if (path === undefined) {
      return false;
    }

    try {
      ChatSessionSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
      return true;
    } catch {
      return false;
    }
  }

  private quarantineCorruptSession(id: string, path: string, raw: string, error: unknown): void {
    const quarantinePath = `${path}.corrupt-${deterministicNow()}-${randomBytes(3).toString('hex')}`;
    const reason = formatCorruptSessionReason(error);
    const projectId = this.extractProjectId(raw);
    const diagnostic: CorruptChatSessionFile = {
      id,
      ...(projectId === undefined ? {} : { projectId }),
      path,
      quarantinePath,
      reason,
    };
    this.corruptions.set(id, diagnostic);

    try {
      renameSync(path, quarantinePath);
    } catch (renameError) {
      diagnostic.reason = `${reason}; failed to quarantine: ${renameError instanceof Error ? renameError.message : String(renameError)}`;
    }

    console.warn(
      `[chat-session-store] corrupt chat session ${id} quarantined at ${diagnostic.quarantinePath}: ${diagnostic.reason}`,
    );
  }

  private listQuarantinedFiles(): CorruptChatSessionFile[] {
    try {
      return readdirSync(this.storeDir)
        .filter((file) => file.includes('.json.corrupt-'))
        .map((file) => {
          const id = file.slice(0, file.indexOf('.json.corrupt-'));
          const quarantinePath = join(this.storeDir, file);
          const projectId = this.extractProjectIdFromFile(quarantinePath);
          return {
            id,
            ...(projectId === undefined ? {} : { projectId }),
            path: this.filePath(id),
            quarantinePath,
            reason: 'previously quarantined corrupt chat session file',
          };
        });
    } catch {
      return [];
    }
  }

  private extractProjectIdFromFile(path: string): string | undefined {
    try {
      return this.extractProjectId(readFileSync(path, 'utf-8'));
    } catch {
      return undefined;
    }
  }

  private extractProjectId(raw: string): string | undefined {
    try {
      const parsed = JSON.parse(raw) as { projectId?: unknown };
      return typeof parsed.projectId === 'string' ? parsed.projectId : undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Compatibility store that keeps legacy session files as transport bindings
 * while a workspace BrainConversation is the canonical state for new sessions.
 */
export class BrainConversationSessionStore implements ISessionStore {
  constructor(
    private readonly legacyStore: ISessionStore,
    private readonly brainRegistry: BrainRegistry,
    private readonly subjectId: string,
  ) {}

  mutationKey(sessionId: string): string {
    const legacy = this.legacyStore.get(sessionId);
    if (!legacy) return sessionId;
    const brain = this.brainRegistry.getWorkspaceHive(legacy.projectId);
    return brain?.conversations.getConversationIdForSession(sessionId) ?? sessionId;
  }

  create(projectId: string): ChatSession {
    const binding = this.legacyStore.create(projectId);
    try {
      const brain = this.brainRegistry.forWorkspaceHive(projectId);
      const conversation = brain.conversations.resolveOrCreateAndBind(
        projectId,
        this.subjectId,
        binding.id,
      );
      const projected = this.project(binding, conversation);
      this.repairProjection(binding.id, projected, brain);
      return projected;
    } catch (error) {
      try {
        this.legacyStore.delete(binding.id);
      } catch {
        // The unbound legacy record remains readable if compensating cleanup fails.
      }
      throw error;
    }
  }

  get(id: string): ChatSession | undefined {
    const binding = this.legacyStore.get(id);
    if (!binding) return undefined;
    const brain = this.brainRegistry.getWorkspaceHive(binding.projectId);
    if (!brain) return binding;
    const conversationId = brain.conversations.getConversationIdForSession(id);
    if (!conversationId) return binding;
    const conversation = brain.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`BrainConversation binding ${id} references missing conversation ${conversationId}`);
    }
    const projected = this.project(binding, conversation);
    if (brain.conversations.isProjectionPending(id)) {
      this.repairProjection(id, projected, brain);
    }
    return projected;
  }

  save(session: ChatSession): void {
    const binding = this.legacyStore.get(session.id);
    let brain = this.brainRegistry.getWorkspaceHive(session.projectId);
    const conversationId = brain?.conversations.getConversationIdForSession(session.id);
    if (binding && (!brain || !conversationId)) {
      this.legacyStore.save(session);
      return;
    }
    if (!brain || !conversationId) {
      brain = this.brainRegistry.forWorkspaceHive(session.projectId);
      const conversation = brain.conversations.resolveOrCreateAndBind(
        session.projectId,
        this.subjectId,
        session.id,
      );
      try {
        const canonical = this.toConversation(session, conversation);
        brain.conversations.saveBound(session.id, canonical);
        this.repairProjection(session.id, this.project(session, canonical), brain);
        return;
      } catch (error) {
        brain.conversations.unbindSession(session.id);
        throw error;
      }
    }
    const conversation = brain.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`BrainConversation binding ${session.id} references missing conversation ${conversationId}`);
    }
    const canonical = this.toConversation(session, conversation);
    brain.conversations.saveBound(session.id, canonical);
    this.repairProjection(session.id, this.project(session, canonical), brain);
  }

  list(): string[] {
    return this.legacyStore.list();
  }

  listSessions(projectId?: string): ChatSession[] {
    return this.list()
      .map((id) => this.get(id))
      .filter((session): session is ChatSession => session !== undefined)
      .filter((session) => projectId === undefined || session.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  listCorruptions(projectId?: string): CorruptChatSessionFile[] {
    return this.legacyStore.listCorruptions?.(projectId) ?? [];
  }

  delete(id: string): void {
    const binding = this.legacyStore.get(id);
    if (!binding) return;
    this.brainRegistry
      .getWorkspaceHive(binding.projectId)
      ?.conversations.unbindSession(id);
    this.legacyStore.delete(id);
  }

  private project(binding: ChatSession, conversation: BrainConversation): ChatSession {
    return {
      id: binding.id,
      conversationId: conversation.id,
      projectId: binding.projectId,
      transcript: conversation.transcript,
      state: conversation.state,
      pendingApproval: conversation.pendingApproval,
      beastContext: conversation.beastContext,
      providerContext: conversation.providerContext,
      routingMetadata: conversation.routingMetadata,
      tokenTotals: conversation.tokenTotals,
      costUsd: conversation.costUsd,
      createdAt: binding.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private repairProjection(
    sessionId: string,
    projection: ChatSession,
    brain: ReturnType<BrainRegistry['forWorkspaceHive']>,
  ): void {
    try {
      this.legacyStore.save(projection);
      brain.conversations.markProjectionComplete(sessionId);
    } catch {
      // Canonical state and the pending marker committed together. A later read retries this projection.
    }
  }

  private toConversation(session: ChatSession, existing: BrainConversation): BrainConversation {
    return {
      ...existing,
      transcript: session.transcript,
      state: session.state,
      pendingApproval: session.pendingApproval ?? null,
      beastContext: session.beastContext ?? null,
      providerContext: session.providerContext ?? null,
      routingMetadata: session.routingMetadata ?? {},
      tokenTotals: session.tokenTotals,
      costUsd: session.costUsd,
      updatedAt: session.updatedAt,
    };
  }
}
