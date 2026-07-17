import { join } from 'node:path';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from '../init/init-json-file.js';
import type { CacheEntry, CacheStoreOptions, StoredCacheEntry } from './llm-cache-types.js';
import { encodeCachePathSegment } from './llm-cache-types.js';

export class LlmCacheStore {
  constructor(
    private readonly rootDir: string,
    private readonly options: CacheStoreOptions,
  ) {}

  async saveProjectEntry(projectId: string, key: string, entry: CacheEntry): Promise<void> {
    const filePath = this.projectEntryPath(projectId, key);
    await this.write(filePath, {
      ...entry,
      schemaVersion: this.options.schemaVersion,
    });
  }

  async loadProjectEntry(projectId: string, key: string): Promise<StoredCacheEntry | undefined> {
    return this.read(this.projectEntryPath(projectId, key));
  }

  async saveWorkEntry(projectId: string, workId: string, key: string, entry: CacheEntry): Promise<void> {
    const filePath = this.workEntryPath(projectId, workId, key);
    await this.write(filePath, {
      ...entry,
      schemaVersion: this.options.schemaVersion,
    });
  }

  async loadWorkEntry(projectId: string, workId: string, key: string): Promise<StoredCacheEntry | undefined> {
    return this.read(this.workEntryPath(projectId, workId, key));
  }

  private projectEntryPath(projectId: string, key: string): string {
    return join(
      this.rootDir,
      'project',
      encodeCachePathSegment(projectId),
      'stable',
      `${encodeCachePathSegment(key)}.json`,
    );
  }

  private workEntryPath(projectId: string, workId: string, key: string): string {
    return join(
      this.rootDir,
      'work',
      encodeCachePathSegment(projectId),
      encodeCachePathSegment(workId),
      'entries',
      `${encodeCachePathSegment(key)}.json`,
    );
  }

  private async write(filePath: string, entry: StoredCacheEntry): Promise<void> {
    await writeJsonFileAtomic(filePath, entry);
  }

  private async read(filePath: string): Promise<StoredCacheEntry | undefined> {
    const stored = await readJsonFileOrDefault<unknown>(filePath, () => undefined, {
      description: 'LLM cache entry',
      onCorrupt: warnJsonQuarantined,
    });

    if (!this.isValidStoredCacheEntry(stored)) {
      return undefined;
    }

    return stored;
  }

  private isValidStoredCacheEntry(value: unknown): value is StoredCacheEntry {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as Partial<StoredCacheEntry>;
    return (
      typeof entry.schemaVersion === 'number' &&
      entry.schemaVersion === this.options.schemaVersion &&
      typeof entry.content === 'string'
    );
  }
}
