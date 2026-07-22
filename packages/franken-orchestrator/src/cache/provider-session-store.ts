import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  quarantineJsonFile,
  readJsonFileOrDefault,
  warnJsonQuarantined,
  writeJsonFileAtomic,
  type JsonCorruptionRecovery,
} from '../init/init-json-file.js';
import type {
  CacheStoreOptions,
  ProviderSessionLookup,
  ProviderSessionRecord,
  StoredProviderSessionRecord,
} from './llm-cache-types.js';
import { encodeCachePathSegment } from './llm-cache-types.js';

const StoredProviderSessionRecordSchema = z.object({
  projectId: z.string(),
  workId: z.string(),
  provider: z.string(),
  model: z.string(),
  sessionId: z.string(),
  promptFingerprint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.number(),
}) satisfies z.ZodType<StoredProviderSessionRecord>;

function warnInvalidProviderSession({ filePath, quarantinePath, error }: JsonCorruptionRecovery): void {
  console.warn(
    `Invalid provider session record in ${filePath}; quarantined original at ${quarantinePath} and continuing with a cache miss. ${error instanceof Error ? error.message : String(error)}`,
  );
}

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
    const stored = await readJsonFileOrDefault<unknown>(filePath, () => undefined, {
      description: 'provider session',
      onCorrupt: warnJsonQuarantined,
    });
    const parsed = StoredProviderSessionRecordSchema.safeParse(stored);
    if (parsed.success) {
      return parsed.data;
    }
    if (stored === undefined) {
      return undefined;
    }

    await quarantineJsonFile(filePath, {
      description: 'provider session record',
      error: parsed.error,
      onCorrupt: warnInvalidProviderSession,
    });
    return undefined;
  }
}
