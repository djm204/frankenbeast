import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ChatSessionSchema, type ChatSession } from './types.js';

export interface ISessionStore {
  create(projectId: string): ChatSession;
  get(id: string): ChatSession | undefined;
  save(session: ChatSession): void;
  list(): string[];
  delete(id: string): void;
}

export class FileSessionStore implements ISessionStore {
  private readonly storeDir: string;

  constructor(storeDir: string) {
    this.storeDir = storeDir;
  }

  create(projectId: string): ChatSession {
    const id = `chat-${Date.now()}-${randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();
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
    } catch {
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
    writeFileSync(this.filePath(session.id), JSON.stringify(session, null, 2), 'utf-8');
  }
}
