import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ChatSessionSchema, type ChatSession } from './types.js';
import { isoNow, now as deterministicNow } from '@franken/types';

export interface CorruptChatSessionFile {
  id: string;
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
  listCorruptions?(): CorruptChatSessionFile[];
  delete(id: string): void;
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
    try {
      const raw = readFileSync(this.filePath(id), 'utf-8');
      return ChatSessionSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (!isNotFoundError(error)) {
        this.quarantineCorruptSession(id, error);
      }
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

  listCorruptions(): CorruptChatSessionFile[] {
    return Array.from(this.corruptions.values()).sort((left, right) => left.id.localeCompare(right.id));
  }

  delete(id: string): void {
    try {
      unlinkSync(this.filePath(id));
    } catch {
      // swallow ENOENT
    }
  }

  private filePath(id: string): string {
    return join(this.storeDir, `${id}.json`);
  }

  private writeToDisk(session: ChatSession): void {
    mkdirSync(this.storeDir, { recursive: true });
    const destination = this.filePath(session.id);
    const tmpPath = `${destination}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      writeFileSync(tmpPath, JSON.stringify(session, null, 2), 'utf-8');
      renameSync(tmpPath, destination);
      this.corruptions.delete(session.id);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup only; preserve the original write failure.
      }
      throw error;
    }
  }

  private quarantineCorruptSession(id: string, error: unknown): void {
    const path = this.filePath(id);
    const quarantinePath = `${path}.corrupt-${deterministicNow()}`;
    const reason = error instanceof Error ? error.message : String(error);
    const diagnostic: CorruptChatSessionFile = { id, path, quarantinePath, reason };
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
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
