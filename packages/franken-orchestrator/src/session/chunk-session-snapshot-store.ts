import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';
import { chunkSessionStorageKey } from './chunk-session.js';
import { atomicWriteFileSync, readJsonFileOrQuarantine } from './atomic-file.js';
import { wallClockNow } from '@franken/types';

export class FileChunkSessionSnapshotStore {
  constructor(private readonly rootDir: string) {}

  writeSnapshot(session: ChunkSession, reason: string): string {
    const dir = this.snapshotDir(session.planName, session.chunkId, session.taskId);
    mkdirSync(dir, { recursive: true });
    const ts = new Date(wallClockNow()).toISOString().replace(/[:.]/g, '-');
    const uniqueSuffix = randomUUID();
    const file = join(dir, `${ts}-gen-${session.compactionGeneration}-${uniqueSuffix}-${reason}.json`);
    atomicWriteFileSync(file, JSON.stringify(session, null, 2));
    return file;
  }

  list(planName: string, chunkId: string, taskId?: string): string[] {
    if (taskId) {
      const dir = this.snapshotDir(planName, chunkId, taskId);
      if (!existsSync(dir)) {
        return [];
      }
      return readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => join(dir, file))
        // Corrupt snapshots are quarantined and skipped here too — the
        // taskId-scoped fast path must degrade the same way as the
        // unscoped listing below, not silently hand back a torn file.
        .filter((filePath) => readJsonFileOrQuarantine<ChunkSession>(filePath) !== undefined)
        .sort();
    }

    const planDir = join(this.rootDir, planName);
    if (!existsSync(planDir)) {
      return [];
    }

    return readdirSync(planDir)
      .map((dirName) => join(planDir, dirName))
      .filter((dirPath) => existsSync(dirPath) && statSync(dirPath).isDirectory())
      .flatMap((dirPath) =>
        readdirSync(dirPath)
          .filter((file) => file.endsWith('.json'))
          .map((file) => join(dirPath, file)),
      )
      // Corrupt snapshots are quarantined and skipped instead of aborting the
      // whole listing — one damaged snapshot must not hide the healthy ones.
      .map((filePath) => ({ filePath, session: readJsonFileOrQuarantine<ChunkSession>(filePath) }))
      .filter((entry): entry is { filePath: string; session: ChunkSession } => entry.session !== undefined)
      .filter(({ session }) => session.chunkId === chunkId)
      .map(({ filePath }) => filePath)
      .sort();
  }

  /**
   * Restores the most recent snapshot, skipping (and quarantining) any
   * corrupt files it encounters along the way so a single damaged snapshot
   * cannot hide older, still-usable ones.
   */
  restoreLatest(planName: string, chunkId: string, taskId?: string): ChunkSession | undefined {
    const files = this.list(planName, chunkId, taskId);
    for (let i = files.length - 1; i >= 0; i--) {
      const session = readJsonFileOrQuarantine<ChunkSession>(files[i]!);
      if (session) {
        return session;
      }
    }
    return undefined;
  }

  private snapshotDir(planName: string, chunkId: string, taskId?: string): string {
    return join(this.rootDir, planName, chunkSessionStorageKey(chunkId, taskId));
  }
}
