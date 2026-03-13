import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';
import { chunkSessionStorageKey } from './chunk-session.js';

export class FileChunkSessionSnapshotStore {
  constructor(private readonly rootDir: string) {}

  writeSnapshot(session: ChunkSession, reason: string): string {
    const dir = this.snapshotDir(session.planName, session.chunkId, session.taskId);
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${ts}-gen-${session.compactionGeneration}-${reason}.json`);
    writeFileSync(file, JSON.stringify(session, null, 2));
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
      .map((filePath) => ({ filePath, session: JSON.parse(readFileSync(filePath, 'utf-8')) as ChunkSession }))
      .filter(({ session }) => session.chunkId === chunkId)
      .map(({ filePath }) => filePath)
      .sort();
  }

  restoreLatest(planName: string, chunkId: string, taskId?: string): ChunkSession | undefined {
    const files = this.list(planName, chunkId, taskId);
    const latest = files.at(-1);
    if (!latest) {
      return undefined;
    }
    return JSON.parse(readFileSync(latest, 'utf-8')) as ChunkSession;
  }

  private snapshotDir(planName: string, chunkId: string, taskId?: string): string {
    return join(this.rootDir, planName, chunkSessionStorageKey(chunkId, taskId));
  }
}
