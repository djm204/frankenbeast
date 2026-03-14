import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  CacheStoreOptions,
  ProviderSessionLookup,
  ProviderSessionRecord,
  StoredProviderSessionRecord,
} from './llm-cache-types.js';
import { encodeCachePathSegment } from './llm-cache-types.js';

export class ProviderSessionStore {
  constructor(
    private readonly rootDir: string,
    private readonly options: CacheStoreOptions,
  ) {}

  async save(record: ProviderSessionRecord): Promise<void> {
    const filePath = this.sessionPath(record.projectId, record.workId);
    const stored: StoredProviderSessionRecord = {
      ...record,
      schemaVersion: this.options.schemaVersion,
    };
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(stored, null, 2) + '\n', 'utf8');
  }

  async load(criteria: ProviderSessionLookup): Promise<StoredProviderSessionRecord | undefined> {
    const stored = await this.read(this.sessionPath(criteria.projectId, criteria.workId));
    if (!stored) {
      return undefined;
    }

    if (stored.schemaVersion !== this.options.schemaVersion) {
      return undefined;
    }

    if (stored.provider !== criteria.provider) {
      return undefined;
    }

    if (stored.model !== criteria.model) {
      return undefined;
    }

    if (stored.promptFingerprint !== criteria.promptFingerprint) {
      return undefined;
    }

    return stored;
  }

  private sessionPath(projectId: string, workId: string): string {
    return join(
      this.rootDir,
      'work',
      encodeCachePathSegment(projectId),
      encodeCachePathSegment(workId),
      'provider-session.json',
    );
  }

  private async read(filePath: string): Promise<StoredProviderSessionRecord | undefined> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as StoredProviderSessionRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
