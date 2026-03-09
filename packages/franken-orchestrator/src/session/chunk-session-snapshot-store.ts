import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChunkSession } from './chunk-session.js';

export class FileChunkSessionSnapshotStore {
  constructor(private readonly rootDir: string) {}

  writeSnapshot(session: ChunkSession, reason: string): string {
    const dir = this.snapshotDir(session.planName, session.chunkId);
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${ts}-gen-${session.compactionGeneration}-${reason}.json`);
    writeFileSync(file, JSON.stringify(session, null, 2));
    return file;
  }

  list(planName: string, chunkId: string): string[] {
    const dir = this.snapshotDir(planName, chunkId);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => join(dir, file))
      .sort();
  }

  restoreLatest(planName: string, chunkId: string): ChunkSession | undefined {
    const files = this.list(planName, chunkId);
    const latest = files.at(-1);
    if (!latest) {
      return undefined;
    }
    return JSON.parse(readFileSync(latest, 'utf-8')) as ChunkSession;
  }

  private snapshotDir(planName: string, chunkId: string): string {
    return join(this.rootDir, planName, chunkId);
  }
}
