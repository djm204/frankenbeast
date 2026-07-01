import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';
import { chunkSessionStorageKey } from './chunk-session.js';
import { atomicWriteFileSync, readJsonFileOrQuarantine } from './atomic-file.js';

export class FileChunkSessionStore {
  constructor(private readonly rootDir: string) {}

  save(session: ChunkSession): string {
    const filePath = this.filePathFor(session.planName, session.chunkId, session.taskId);
    mkdirSync(dirname(filePath), { recursive: true });
    atomicWriteFileSync(filePath, JSON.stringify(session, null, 2));
    return filePath;
  }

  /**
   * Loads a session, degrading gracefully instead of throwing when a file is
   * corrupt (e.g. from a crash mid-write before atomic writes were adopted,
   * or external tampering). Corrupt files are quarantined by
   * readJsonFileOrQuarantine so a subsequent read never trips over them again.
   */
  load(planName: string, chunkId: string, taskId?: string): ChunkSession | undefined {
    const exactPath = this.filePathFor(planName, chunkId, taskId);
    if (existsSync(exactPath)) {
      const session = readJsonFileOrQuarantine<ChunkSession>(exactPath);
      if (session) {
        return session;
      }
      // Corrupt and quarantined — fall through and treat as absent.
    }

    const legacyPath = this.legacyFilePathFor(planName, chunkId);
    if (existsSync(legacyPath)) {
      const legacy = readJsonFileOrQuarantine<ChunkSession>(legacyPath);
      if (legacy) {
        if (!taskId || legacy.taskId === taskId) {
          return legacy;
        }
        return undefined;
      }
      // Corrupt and quarantined — fall through and treat as absent.
    }

    const matches = this.list(planName).filter((session) =>
      session.chunkId === chunkId && (taskId === undefined || session.taskId === taskId),
    );
    if (matches.length === 1) {
      return matches[0];
    }
    return undefined;
  }

  delete(planName: string, chunkId: string, taskId?: string): void {
    if (taskId) {
      const filePath = this.filePathFor(planName, chunkId, taskId);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
      return;
    }

    const matches = this.list(planName).filter((session) => session.chunkId === chunkId);
    if (matches.length > 0) {
      for (const session of matches) {
        const filePath = this.filePathFor(session.planName, session.chunkId, session.taskId);
        if (existsSync(filePath)) {
          rmSync(filePath, { force: true });
        }
      }
      return;
    }

    const legacyPath = this.legacyFilePathFor(planName, chunkId);
    if (existsSync(legacyPath)) {
      rmSync(legacyPath, { force: true });
    }
  }

  list(planName?: string): ChunkSession[] {
    const plans = planName ? [planName] : this.listPlanNames();
    const sessions: ChunkSession[] = [];

    for (const plan of plans) {
      const planDir = join(this.rootDir, plan);
      if (!existsSync(planDir)) continue;

      for (const file of readdirSync(planDir)) {
        if (!file.endsWith('.json')) continue;
        // Corrupt files are quarantined and skipped instead of aborting the
        // whole listing — one damaged session must not hide the healthy ones.
        const session = readJsonFileOrQuarantine<ChunkSession>(join(planDir, file));
        if (session) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  private filePathFor(planName: string, chunkId: string, taskId?: string): string {
    return join(this.rootDir, planName, `${chunkSessionStorageKey(chunkId, taskId)}.json`);
  }

  private legacyFilePathFor(planName: string, chunkId: string): string {
    return join(this.rootDir, planName, `${chunkId}.json`);
  }

  private listPlanNames(): string[] {
    if (!existsSync(this.rootDir)) {
      return [];
    }

    return readdirSync(this.rootDir).filter((entry) => statSync(join(this.rootDir, entry)).isDirectory());
  }
}
