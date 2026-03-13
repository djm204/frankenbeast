import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FileChunkSessionStore } from './chunk-session-store.js';
import { chunkSessionStorageKey } from './chunk-session.js';

export interface ChunkSessionGcConfig {
  sessionRoot: string;
  snapshotRoot: string;
  completedTtlMs: number;
  failedTtlMs: number;
}

export class ChunkSessionGc {
  private readonly store: FileChunkSessionStore;

  constructor(private readonly config: ChunkSessionGcConfig) {
    this.store = new FileChunkSessionStore(config.sessionRoot);
  }

  collect(now: Date = new Date()): number {
    let removed = 0;
    removed += this.collectExpiredSessions(now);
    removed += this.collectOrphanedSnapshots();
    return removed;
  }

  private collectExpiredSessions(now: Date): number {
    let removed = 0;
    const sessions = this.store.list();

    for (const session of sessions) {
      if (session.status === 'active') {
        continue;
      }

      const updatedAt = new Date(session.updatedAt).getTime();
      const ttlMs = session.status === 'failed' ? this.config.failedTtlMs : this.config.completedTtlMs;
      if (now.getTime() - updatedAt > ttlMs) {
        this.store.delete(session.planName, session.chunkId, session.taskId);
        removed++;
      }
    }

    return removed;
  }

  private collectOrphanedSnapshots(): number {
    if (!existsSync(this.config.snapshotRoot)) {
      return 0;
    }

    let removed = 0;
    const activeSessionKeys = new Set(
      this.store.list().map((session) => `${session.planName}/${chunkSessionStorageKey(session.chunkId, session.taskId)}`),
    );
    for (const planName of readdirSync(this.config.snapshotRoot)) {
      const planDir = join(this.config.snapshotRoot, planName);
      if (!statSync(planDir).isDirectory()) continue;

      for (const sessionKey of readdirSync(planDir)) {
        const chunkDir = join(planDir, sessionKey);
        if (!statSync(chunkDir).isDirectory()) continue;

        if (!activeSessionKeys.has(`${planName}/${sessionKey}`)) {
          rmSync(chunkDir, { recursive: true, force: true });
          removed++;
        }
      }
    }

    return removed;
  }
}
