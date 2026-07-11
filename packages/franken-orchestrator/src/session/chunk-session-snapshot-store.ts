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

    return this.listUnscopedCandidates(planName)
      // Corrupt snapshots are quarantined and skipped instead of aborting the
      // whole listing — one damaged snapshot must not hide the healthy ones.
      .filter((entry): entry is { filePath: string; storageKey: string; session: ChunkSession } =>
        entry.session !== undefined,
      )
      .filter(({ session }) => session.chunkId === chunkId)
      .map(({ filePath }) => filePath)
      .sort();
  }

  /**
   * Restores the most recent snapshot, skipping (and quarantining) any
   * corrupt files it encounters along the way so a single damaged snapshot
   * cannot hide older, still-usable ones.
   *
   * Unscoped restores intentionally fail closed when multiple task-scoped
   * sessions share a chunk id. Without a task id, newest-by-filename ordering
   * cannot tell which task owns the requested restore.
   */
  restoreLatest(planName: string, chunkId: string, taskId?: string): ChunkSession | undefined {
    if (!taskId) {
      const entries = this.listUnscopedCandidates(planName);
      const matchingEntries = entries
        .filter((entry): entry is { filePath: string; storageKey: string; session: ChunkSession } =>
          entry.session !== undefined,
        )
        .filter(({ session }) => session.chunkId === chunkId)
        .sort((a, b) => a.filePath.localeCompare(b.filePath));
      const matchingTaskIds = new Set(
        matchingEntries.map(({ session, storageKey }) => session.taskId ?? this.normalizeStorageKey(storageKey)),
      );

      // Corrupt snapshots cannot prove their chunk id after quarantine, but
      // their task-scoped directory is still evidence that another task may
      // own the requested chunk. Count those directories in the ambiguity set
      // so an unscoped restore fails closed instead of falling back to a
      // healthy snapshot from a different task. Only skip a corrupt directory
      // when its task-style storage key clearly names a different chunk.
      for (const { session, storageKey } of entries) {
        if (session === undefined && !this.storageKeyClearlyNamesOtherChunk(storageKey, chunkId)) {
          matchingTaskIds.add(this.normalizeStorageKey(storageKey));
        }
      }

      if (matchingTaskIds.size > 1) {
        return undefined;
      }

      return matchingEntries.at(-1)?.session;
    }

    const files = this.list(planName, chunkId, taskId);
    const sessions = files
      .map((filePath) => readJsonFileOrQuarantine<ChunkSession>(filePath))
      .filter((session): session is ChunkSession => session !== undefined);

    return sessions.at(-1);
  }

  private listUnscopedCandidates(planName: string): Array<{
    filePath: string;
    storageKey: string;
    session: ChunkSession | undefined;
  }> {
    const planDir = join(this.rootDir, planName);
    if (!existsSync(planDir)) {
      return [];
    }

    return readdirSync(planDir)
      .map((storageKey) => ({ storageKey, dirPath: join(planDir, storageKey) }))
      .filter(({ dirPath }) => existsSync(dirPath) && statSync(dirPath).isDirectory())
      .flatMap(({ storageKey, dirPath }) =>
        readdirSync(dirPath)
          .filter((file) => file.endsWith('.json') || file.includes('.json.corrupt.'))
          .map((file) => {
            const filePath = join(dirPath, file);
            return {
              filePath,
              storageKey,
              session: file.includes('.json.corrupt.') ? undefined : readJsonFileOrQuarantine<ChunkSession>(filePath),
            };
          }),
      );
  }

  private normalizeStorageKey(storageKey: string): string {
    try {
      return decodeURIComponent(storageKey);
    } catch {
      return storageKey;
    }
  }

  private storageKeyClearlyNamesOtherChunk(storageKey: string, chunkId: string): boolean {
    if (this.storageKeyMayContainChunk(storageKey, chunkId)) {
      return false;
    }
    const normalized = this.normalizeStorageKey(storageKey);
    return normalized.includes(':') || normalized.includes('/');
  }

  private storageKeyMayContainChunk(storageKey: string, chunkId: string): boolean {
    const normalized = this.normalizeStorageKey(storageKey);
    let index = normalized.indexOf(chunkId);
    while (index !== -1) {
      const before = index === 0 ? '' : normalized[index - 1];
      const after = index + chunkId.length >= normalized.length ? '' : normalized[index + chunkId.length];
      const hasValidPrefix = before === '' || before === ':' || before === '/' || before === '-' || before === '_';
      const hasValidSuffix = after === '' || after === ':' || after === '/' || after === '-' || after === '_';
      if (hasValidPrefix && hasValidSuffix) {
        return true;
      }
      index = normalized.indexOf(chunkId, index + 1);
    }
    return false;
  }

  private snapshotDir(planName: string, chunkId: string, taskId?: string): string {
    return join(this.rootDir, planName, chunkSessionStorageKey(chunkId, taskId));
  }
}
