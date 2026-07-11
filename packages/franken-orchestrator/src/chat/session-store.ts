import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
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
      this.quarantineCorruptSession(id, path, error);
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
    for (const diagnostic of this.listQuarantinedFiles()) {
      if (!this.corruptions.has(diagnostic.id)) {
        this.corruptions.set(diagnostic.id, diagnostic);
      }
    }
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

  private safeFilePath(id: string): string | undefined {
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

  private quarantineCorruptSession(id: string, path: string, error: unknown): void {
    const quarantinePath = `${path}.corrupt-${deterministicNow()}-${randomBytes(3).toString('hex')}`;
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

  private listQuarantinedFiles(): CorruptChatSessionFile[] {
    try {
      return readdirSync(this.storeDir)
        .filter((file) => file.includes('.json.corrupt-'))
        .map((file) => {
          const id = file.slice(0, file.indexOf('.json.corrupt-'));
          return {
            id,
            path: this.filePath(id),
            quarantinePath: join(this.storeDir, file),
            reason: 'previously quarantined corrupt chat session file',
          };
        });
    } catch {
      return [];
    }
  }
}
