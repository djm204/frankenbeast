import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf8');
  }

  private async read(filePath: string): Promise<StoredCacheEntry | undefined> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as StoredCacheEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
