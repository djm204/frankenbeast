import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from '../init/init-json-file.js';
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
    await writeJsonFileAtomic(filePath, stored);
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

  async remove(projectId: string, workId: string): Promise<void> {
    await rm(this.sessionPath(projectId, workId), { force: true });
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
    return readJsonFileOrDefault<StoredProviderSessionRecord | undefined>(filePath, () => undefined, {
      description: 'provider session',
      onCorrupt: warnJsonQuarantined,
    });
  }
}
